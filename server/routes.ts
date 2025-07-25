import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { googleDriveService } from "./services/google-drive";
import { fileProcessorService } from "./services/file-processor";
import { openAIService } from "./services/openai";
import { agenticSearchService } from "./services/agentic-search";
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
          // Get full metadata from Google Drive to check for AI properties
          const fullMetadata = await googleDriveService.getFileMetadata(driveFile.id);
          const driveProperties = fullMetadata.properties || {};
          
          // Restore AI metadata from Google Drive properties
          let aiGeneratedMetadata = null;
          let status = 'pending';
          
          if (Object.keys(driveProperties).some(key => key.startsWith('AI_'))) {
            // Reconstruct AI metadata from Google Drive properties
            aiGeneratedMetadata = {};
            for (const [key, value] of Object.entries(driveProperties)) {
              if (key.startsWith('AI_')) {
                const metadataKey = key.substring(3); // Remove 'AI_' prefix
                
                // Handle arrays (tags) and other data types
                if (metadataKey === 'tags' && typeof value === 'string') {
                  try {
                    aiGeneratedMetadata[metadataKey] = JSON.parse(value);
                  } catch {
                    aiGeneratedMetadata[metadataKey] = value.split(',').map(tag => tag.trim());
                  }
                } else {
                  aiGeneratedMetadata[metadataKey] = value;
                }
              }
            }
            
            if (Object.keys(aiGeneratedMetadata).length > 0) {
              status = 'processed';
            }
          }

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
            status: status,
            processingError: null,
            existingMetadata: null,
            aiGeneratedMetadata: aiGeneratedMetadata,
            customMetadata: null
          };

          const validatedData = insertDriveFileSchema.parse(fileData);
          stored = await storage.createDriveFile(validatedData);
        } else {
          // For existing files, check if we need to restore AI metadata
          if (!stored.aiGeneratedMetadata || Object.keys(stored.aiGeneratedMetadata as any).length === 0) {
            try {
              const fullMetadata = await googleDriveService.getFileMetadata(driveFile.id);
              const driveProperties = fullMetadata.properties || {};
              console.log(`Route AI restoration for ${driveFile.name}: properties=`, driveProperties);
              
              if (Object.keys(driveProperties).some(key => key.startsWith('AI_'))) {
                console.log(`Found AI properties for ${driveFile.name}`);
                // Reconstruct AI metadata from Google Drive properties
                const aiGeneratedMetadata: any = {};
                for (const [key, value] of Object.entries(driveProperties)) {
                  if (key.startsWith('AI_')) {
                    const metadataKey = key.substring(3); // Remove 'AI_' prefix
                    
                    // Handle arrays (tags) and other data types
                    if (metadataKey === 'tags' && typeof value === 'string') {
                      try {
                        aiGeneratedMetadata[metadataKey] = JSON.parse(value);
                      } catch {
                        aiGeneratedMetadata[metadataKey] = value.split(',').map((tag: string) => tag.trim());
                      }
                    } else {
                      aiGeneratedMetadata[metadataKey] = value;
                    }
                  }
                }
                
                if (Object.keys(aiGeneratedMetadata).length > 0) {
                  // Update the stored file with restored AI metadata
                  stored = await storage.updateDriveFile(stored.id, {
                    aiGeneratedMetadata: aiGeneratedMetadata,
                    status: 'processed'
                  }) || stored;
                }
              }
            } catch (error) {
              console.log(`Could not restore AI metadata for file ${driveFile.name}:`, error);
            }
          }
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

  // Clear all templates
  app.delete("/api/templates/clear", async (req, res) => {
    try {
      await storage.clearAllMetadataTemplates();
      res.json({ message: "All templates cleared successfully" });
    } catch (error) {
      res.status(500).json({ message: error.message });
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

  // Get file properties from Google Drive (AI metadata)
  app.get("/api/drive/properties/:fileId", async (req, res) => {
    try {
      if (!googleDriveService.isAuthenticated()) {
        return res.status(401).json({ error: "Not authenticated with Google Drive" });
      }

      const { fileId } = req.params;
      const metadata = await googleDriveService.getFileMetadata(fileId);
      const properties = metadata.properties || {};
      res.json(properties);
    } catch (error) {
      console.error("Error fetching file properties:", error);
      res.status(500).json({ error: "Failed to fetch file properties" });
    }
  });

  // Export metadata to Google Drive routes
  app.post("/api/export/file/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const file = await storage.getDriveFile(parseInt(id));

      if (!file) {
        return res.status(404).json({ message: "File not found" });
      }

      if (!file.aiGeneratedMetadata) {
        return res.status(400).json({ message: "No AI-generated metadata to export" });
      }

      await fileProcessorService.exportMetadataToDrive(file);
      res.json({ message: "Metadata exported to Google Drive successfully" });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/export/folder/:folderId", async (req, res) => {
    try {
      const { folderId } = req.params;
      const exportedCount = await fileProcessorService.exportAllMetadataToDrive(folderId);

      res.json({ 
        message: `Exported metadata for ${exportedCount} files to Google Drive`,
        exportedCount 
      });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });

  // Verify exported metadata by retrieving it from Google Drive
  app.get("/api/verify/file/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const file = await storage.getDriveFile(parseInt(id));

      if (!file) {
        return res.status(404).json({ message: "File not found" });
      }

      // Get metadata directly from Google Drive
      const driveMetadata = await googleDriveService.getFileMetadata(file.driveId);

      res.json({ 
        fileName: file.name,
        driveProperties: driveMetadata.properties || {},
        exportedMetadata: file.aiGeneratedMetadata 
      });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });

  // Verify exported metadata for all processed files
  app.get("/api/verify/all-files", async (req, res) => {
    try {
      // Get all processed files from database
      const files = await storage
        .getAllDriveFiles();

      if (files.length === 0) {
        return res.json([]);
      }

      const verifications = [];

      // Get metadata for each file
      for (const file of files) {
        try {
          // Get metadata directly from Google Drive
           const driveMetadata = await googleDriveService.getFileMetadata(file.driveId);


          verifications.push({
            fileName: file.name,
            driveProperties: driveMetadata.properties || {},
            exportedMetadata: file.aiGeneratedMetadata
          });
        } catch (error) {
          console.error(`Failed to verify file ${file.name}:`, error);
          verifications.push({
            fileName: file.name,
            driveProperties: {},
            exportedMetadata: file.aiGeneratedMetadata,
            error: error.message
          });
        }
      }

      res.json(verifications);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });

  // Bulk export multiple files
  app.post("/api/export/bulk", async (req, res) => {
    try {
      const { fileIds } = req.body;

      if (!fileIds || !Array.isArray(fileIds) || fileIds.length === 0) {
        return res.status(400).json({ message: "No file IDs provided for bulk export" });
      }

      let exportedCount = 0;
      let skippedCount = 0;
      const errors = [];

      for (const fileId of fileIds) {
        try {
          const file = await storage.getDriveFile(fileId);
          if (file && file.aiGeneratedMetadata) {
            // Get existing metadata to check for changes
            const existingDriveMetadata = await googleDriveService.getFileMetadata(file.driveId);
            const existingProperties = existingDriveMetadata.properties || {};
            
            // Convert AI metadata for comparison
            const newProperties: Record<string, string> = {};
            Object.entries(file.aiGeneratedMetadata).forEach(([key, value]) => {
              const sanitizedKey = `AI_${key}`.replace(/[^a-zA-Z0-9.!@$%^&*()\-_/]/g, '_');
              let stringValue: string;
              if (Array.isArray(value)) {
                stringValue = value.join(', ');
              } else {
                stringValue = String(value);
              }
              newProperties[sanitizedKey] = stringValue;
            });
            
            // Check for changes
            let hasChanges = false;
            for (const [key, value] of Object.entries(newProperties)) {
              if (existingProperties[key] !== value) {
                hasChanges = true;
                break;
              }
            }
            
            if (hasChanges) {
              await fileProcessorService.exportMetadataToDrive(file);
              exportedCount++;
            } else {
              skippedCount++;
            }
          }
        } catch (error) {
          errors.push(`Failed to export file ${fileId}: ${error.message}`);
        }
      }

      res.json({ 
        message: `Bulk export completed. Exported ${exportedCount} files, skipped ${skippedCount} files (no changes).${errors.length > 0 ? ` ${errors.length} files failed.` : ''}`,
        exportedCount,
        skippedCount,
        errors: errors.length > 0 ? errors : undefined
      });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });

  // AI search endpoint with recursive folder search
  app.post("/api/search", async (req, res) => {
    try {
      const { query, folderId } = req.body;
      
      if (!query || typeof query !== "string") {
        return res.status(400).json({ message: "Search query is required" });
      }

      // Recursive function to get all files from folder and subfolders
      const getAllFilesRecursive = async (targetFolderId: string): Promise<any[]> => {
        const allFiles: any[] = [];
        
        // Get direct files in this folder
        const directFiles = await storage.getDriveFilesByFolder(targetFolderId);
        allFiles.push(...directFiles);
        
        // Get all subfolders and recursively search them
        try {
          const subfolders = await googleDriveService.listFolders(targetFolderId);
          for (const subfolder of subfolders) {
            const subfolderFiles = await getAllFilesRecursive(subfolder.id);
            allFiles.push(...subfolderFiles);
          }
        } catch (error) {
          // Continue if we can't access some subfolders
          console.log(`Could not access subfolders for ${targetFolderId}`);
        }
        
        return allFiles;
      };

      // Get all files from the specified folder and all its subfolders
      const allFiles = await getAllFilesRecursive(folderId || "root");
      
      // Filter files that have been processed and have AI metadata
      const processedFiles = allFiles.filter(file => 
        file.status === "processed" && 
        file.aiGeneratedMetadata
      );

      // Perform search across all metadata fields
      const searchTerms = query.toLowerCase().split(" ");
      const searchResults = processedFiles.filter(file => {
        const searchableContent = [
          file.name.toLowerCase(),
          JSON.stringify(file.aiGeneratedMetadata).toLowerCase(),
          file.type.toLowerCase(),
          file.mimeType.toLowerCase()
        ].join(" ");

        return searchTerms.some(term => searchableContent.includes(term));
      });

      // Sort by relevance (simple scoring based on matches)
      const scoredResults = searchResults.map(file => {
        const searchableContent = [
          file.name.toLowerCase(),
          JSON.stringify(file.aiGeneratedMetadata).toLowerCase()
        ].join(" ");
        
        const score = searchTerms.reduce((acc, term) => {
          const matches = (searchableContent.match(new RegExp(term, "g")) || []).length;
          return acc + matches;
        }, 0);
        
        return { file, score };
      });

      // Sort by score and return files
      const sortedResults = scoredResults
        .sort((a, b) => b.score - a.score)
        .map(result => result.file);

      res.json(sortedResults);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });

  // Get analytics for a specific folder
  app.get("/api/analytics/:folderId", async (req, res) => {
    try {
      const { folderId } = req.params;
      
      // First, let's ensure we have files in our database by calling the files endpoint
      // This will populate the database with files from Google Drive if they don't exist
      const response = await fetch(`http://localhost:5000/api/drive/files/${folderId}`);
      if (response.ok) {
        const driveFiles = await response.json();
        console.log(`Found ${driveFiles.length} files in Google Drive for folder ${folderId}`);
      }
      
      // Recursive function to get all files from folder and subfolders
      const getAllFilesRecursive = async (targetFolderId: string): Promise<any[]> => {
        const allFiles: any[] = [];
        
        // Get direct files in this folder from our database
        const directFiles = await storage.getDriveFilesByFolder(targetFolderId);
        allFiles.push(...directFiles);
        
        // Get all subfolders and recursively search them
        try {
          const subfolders = await googleDriveService.listFolders(targetFolderId);
          for (const subfolder of subfolders) {
            // Also populate each subfolder
            try {
              const subResponse = await fetch(`http://localhost:5000/api/drive/files/${subfolder.id}`);
              if (subResponse.ok) {
                const subDriveFiles = await subResponse.json();
                console.log(`Found ${subDriveFiles.length} files in subfolder ${subfolder.name}`);
              }
            } catch (error) {
              console.log(`Could not populate subfolder ${subfolder.name}`);
            }
            
            const subfolderFiles = await getAllFilesRecursive(subfolder.id);
            allFiles.push(...subfolderFiles);
          }
        } catch (error) {
          // Continue if we can't access some subfolders
          console.log(`Could not access subfolders for ${targetFolderId}`);
        }
        
        return allFiles;
      };
      
      // Get all files recursively from the specified folder
      const allFiles = await getAllFilesRecursive(folderId || 'root');
      
      // Debug logging
      console.log(`Analytics for folder ${folderId}: Found ${allFiles.length} total files in database`);
      
      // Calculate statistics
      const totalFiles = allFiles.length;
      
      // Filter files that have AI metadata
      const filesWithAI = allFiles.filter((file: any) => {
        const hasAIMetadata = file.aiGeneratedMetadata && 
          typeof file.aiGeneratedMetadata === 'object' && 
          Object.keys(file.aiGeneratedMetadata).length > 0;
        
        const isProcessed = file.status === 'processed';
        
        console.log(`File ${file.name}: hasAIMetadata=${hasAIMetadata}, status=${file.status}, aiGeneratedMetadata=${JSON.stringify(file.aiGeneratedMetadata)}`);
        
        return hasAIMetadata;
      });
      
      const filesWithAICount = filesWithAI.length;
      console.log(`Files with AI: ${filesWithAICount}`);
      
      // Calculate field statistics
      let totalPossibleFields = 0;
      let totalFilledFields = 0;
      
      // Collect all unique AI field names from files with AI metadata
      const allAIFields = new Set<string>();
      filesWithAI.forEach((file: any) => {
        if (file.aiGeneratedMetadata) {
          Object.keys(file.aiGeneratedMetadata).forEach(key => allAIFields.add(key));
        }
      });
      
      // Calculate field statistics based on actual fields that exist
      if (filesWithAI.length > 0 && allAIFields.size > 0) {
        filesWithAI.forEach((file: any) => {
          const metadata = file.aiGeneratedMetadata || {};
          
          allAIFields.forEach(fieldName => {
            totalPossibleFields++;
            
            const fieldValue = metadata[fieldName];
            if (fieldValue !== null && fieldValue !== undefined && fieldValue !== '') {
              if (Array.isArray(fieldValue)) {
                if (fieldValue.length > 0) {
                  totalFilledFields++;
                }
              } else {
                totalFilledFields++;
              }
            }
          });
        });
      }
      
      const analytics = {
        totalFiles,
        filesWithAI: filesWithAICount,
        filesWithAIPercentage: totalFiles > 0 ? Math.round((filesWithAICount / totalFiles) * 100) : 0,
        totalPossibleFields,
        totalFilledFields,
        filledFieldsPercentage: totalPossibleFields > 0 ? Math.round((totalFilledFields / totalPossibleFields) * 100) : 0,
        uniqueAIFields: Array.from(allAIFields)
      };
      
      console.log(`Final analytics:`, analytics);
      res.json(analytics);
    } catch (error) {
      console.error('Analytics error:', error);
      res.status(500).json({ message: (error as Error).message });
    }
  });



  // Agentic Search - AI-powered natural language file search
  app.get("/api/agentic-search", async (req, res) => {
    try {
      const { q: query, folderId } = req.query;
      
      if (!query || typeof query !== 'string') {
        return res.status(400).json({ 
          error: "Query parameter 'q' is required" 
        });
      }

      const result = await agenticSearchService.performAgenticSearch(query, folderId as string);
      res.json(result);
    } catch (error) {
      console.error('Agentic search error:', error);
      res.status(500).json({ 
        error: "Failed to perform agentic search",
        message: (error as Error).message 
      });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}