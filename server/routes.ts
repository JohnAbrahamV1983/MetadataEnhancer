import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { googleDriveService } from "./services/google-drive";
import { fileProcessorService } from "./services/file-processor";
import multer from "multer";
import csv from "csv-parser";
import * as XLSX from "xlsx";
import { insertDriveFileSchema, insertMetadataTemplateSchema, insertProcessingJobSchema } from "@shared/schema";

const upload = multer({ storage: multer.memoryStorage() });

export async function registerRoutes(app: Express): Promise<Server> {
  // Google Drive authentication
  app.get("/api/auth/google/url", async (req, res) => {
    try {
      const authUrl = googleDriveService.getAuthUrl();
      res.json({ authUrl });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });

  // Check authentication status
  app.get("/api/auth/status", async (req, res) => {
    try {
      const isAuthenticated = googleDriveService.isAuthenticated();
      res.json({ isAuthenticated });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });

  // Get authenticated user info
  app.get("/api/auth/user", async (req, res) => {
    try {
      const userInfo = await googleDriveService.getUserInfo();
      res.json(userInfo);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });

  // Disconnect from Google Drive
  app.post("/api/auth/disconnect", async (req, res) => {
    try {
      googleDriveService.disconnect();
      res.json({ success: true, message: "Disconnected from Google Drive" });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });

  // Handle Google OAuth callback (GET request from redirect)
  app.get("/api/auth/google/callback", async (req, res) => {
    try {
      const { code } = req.query;
      if (!code) {
        return res.status(400).send('Authorization code missing');
      }
      
      await googleDriveService.setAuthToken(code as string);
      
      // Redirect back to the main app with success
      res.send(`
        <script>
          window.opener.postMessage({ type: 'GOOGLE_AUTH_SUCCESS' }, '*');
          window.close();
        </script>
      `);
    } catch (error) {
      res.send(`
        <script>
          window.opener.postMessage({ type: 'GOOGLE_AUTH_ERROR', error: '${error.message}' }, '*');
          window.close();
        </script>
      `);
    }
  });

  // Also keep POST endpoint for manual code submission
  app.post("/api/auth/google/callback", async (req, res) => {
    try {
      const { code } = req.body;
      await googleDriveService.setAuthToken(code);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });

  // Drive folders
  app.get("/api/drive/folders", async (req, res) => {
    try {
      const { parentId } = req.query;
      const folders = await googleDriveService.listFolders(parentId as string);
      res.json(folders);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });

  // Drive files
  app.get("/api/drive/files/:folderId", async (req, res) => {
    try {
      const { folderId } = req.params;
      
      // First get files from Google Drive
      const driveFiles = await googleDriveService.listFiles(folderId);
      
      // Store/update files in our database and return the stored versions
      const storedFiles = [];
      for (const driveFile of driveFiles) {
        let stored = await storage.getDriveFileByDriveId(driveFile.id);
        
        if (!stored) {
          // Create new file record
          const fileData = {
            driveId: driveFile.id,
            name: driveFile.name,
            type: googleDriveService.getFileType(driveFile.mimeType),
            size: parseInt(driveFile.size || '0'),
            mimeType: driveFile.mimeType,
            parentFolderId: folderId,
            webViewLink: driveFile.webViewLink || null,
            thumbnailLink: driveFile.thumbnailLink || null,
            createdTime: new Date(driveFile.createdTime),
            modifiedTime: new Date(driveFile.modifiedTime),
            status: 'pending',
            processingError: null,
            existingMetadata: null,
            aiGeneratedMetadata: null,
            customMetadata: null
          };

          const validatedData = insertDriveFileSchema.parse(fileData);
          stored = await storage.createDriveFile(validatedData);
        }
        
        storedFiles.push(stored);
      }
      
      res.json(storedFiles);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/files/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const file = await storage.getDriveFile(parseInt(id));
      
      if (!file) {
        return res.status(404).json({ message: "File not found" });
      }
      
      res.json(file);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });

  app.patch("/api/files/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;
      
      const updated = await storage.updateDriveFile(parseInt(id), updates);
      
      if (!updated) {
        return res.status(404).json({ message: "File not found" });
      }
      
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });

  // Metadata templates
  app.get("/api/templates", async (req, res) => {
    try {
      const templates = await storage.getAllMetadataTemplates();
      res.json(templates);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/templates", async (req, res) => {
    try {
      const validatedData = insertMetadataTemplateSchema.parse(req.body);
      const template = await storage.createMetadataTemplate(validatedData);
      res.json(template);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });

  app.post("/api/templates/upload", upload.single("file"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const { name, description } = req.body;
      let fields: any[] = [];

      if (req.file.mimetype === "text/csv") {
        // Parse CSV with better handling
        const buffer = req.file.buffer.toString();
        console.log("CSV content:", buffer.substring(0, 500)); // Debug log
        
        const lines = buffer.split('\n');
        
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;
          
          // Simple CSV parsing - handle quoted fields
          const csvFields = [];
          let current = '';
          let inQuotes = false;
          
          for (let j = 0; j < line.length; j++) {
            const char = line[j];
            if (char === '"') {
              inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
              csvFields.push(current.trim().replace(/^"/, '').replace(/"$/, ''));
              current = '';
            } else {
              current += char;
            }
          }
          csvFields.push(current.trim().replace(/^"/, '').replace(/"$/, ''));
          
          const [fieldName, fieldDescription, fieldType, options] = csvFields;
          console.log(`Line ${i}: [${csvFields.join('] [')}]`); // Debug log
          
          if (fieldName && fieldDescription && fieldName !== 'name') { // Skip header row
            fields.push({
              name: fieldName,
              description: fieldDescription,
              type: fieldType || 'text',
              options: options ? options.split(';').map(o => o.trim()).filter(o => o) : undefined
            });
          }
        }
      } else if (req.file.mimetype === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") {
        // Parse Excel
        const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 }); // Get raw array data
        
        console.log("Excel data:", JSON.stringify(data.slice(0, 5))); // Debug log
        
        for (let i = 1; i < data.length; i++) { // Start from 1 to skip header
          const row = data[i] as any[];
          if (row && row.length >= 2) {
            const [fieldName, fieldDescription, fieldType, options] = row;
            console.log(`Excel row ${i}: [${row.join('] [')}]`); // Debug log
            
            if (fieldName && fieldDescription) {
              fields.push({
                name: String(fieldName).trim(),
                description: String(fieldDescription).trim(),
                type: fieldType ? String(fieldType).trim() : 'text',
                options: options ? String(options).split(';').map((o: string) => o.trim()).filter(o => o) : undefined
              });
            }
          }
        }
      } else {
        return res.status(400).json({ message: "Unsupported file format. Please upload CSV or Excel file." });
      }

      console.log("Parsed fields:", JSON.stringify(fields, null, 2)); // Debug log
      
      if (fields.length === 0) {
        return res.status(400).json({ message: "No valid fields found in the uploaded file" });
      }

      const templateData = {
        name: name || req.file.originalname,
        description: description || `Template imported from ${req.file.originalname}`,
        fields
      };

      const validatedData = insertMetadataTemplateSchema.parse(templateData);
      const template = await storage.createMetadataTemplate(validatedData);
      
      res.json(template);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });

  // File processing
  app.post("/api/process/file/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const { templateId } = req.body;
      
      const file = await storage.getDriveFile(parseInt(id));
      if (!file) {
        return res.status(404).json({ message: "File not found" });
      }
      
      const template = templateId ? await storage.getMetadataTemplate(templateId) : undefined;
      
      // Process file in background
      fileProcessorService.processFile(file, template).catch(error => {
        console.error("File processing failed:", error);
      });
      
      res.json({ message: "Processing started" });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/process/batch", async (req, res) => {
    try {
      const { folderId, templateId } = req.body;
      
      // Start batch processing in background
      const jobId = await fileProcessorService.processBatch(folderId, templateId);
      
      res.json({ jobId, message: "Batch processing started" });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });

  // Processing jobs
  app.get("/api/jobs", async (req, res) => {
    try {
      const jobs = await storage.getAllProcessingJobs();
      res.json(jobs);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/jobs/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const job = await storage.getProcessingJob(parseInt(id));
      
      if (!job) {
        return res.status(404).json({ message: "Job not found" });
      }
      
      res.json(job);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
