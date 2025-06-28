import { storage } from '../storage';
import { googleDriveService } from './google-drive';
import { openAIService } from './openai';
import { type DriveFile, type MetadataTemplate } from '@shared/schema';
// PDF parsing will be imported dynamically when needed

export class FileProcessorService {
  async processFile(file: DriveFile, template?: MetadataTemplate): Promise<void> {
    try {
      // Update status to processing
      await storage.updateDriveFile(file.id, { status: 'processing' });

      let generatedMetadata: any = {};

      if (file.type === 'image') {
        generatedMetadata = await this.processImage(file, template);
      } else if (file.type === 'pdf') {
        generatedMetadata = await this.processPDF(file, template);
      } else if (file.type === 'video') {
        generatedMetadata = await this.processVideo(file, template);
      } else {
        // For other file types, generate basic metadata
        generatedMetadata = await openAIService.generateDefaultMetadata(
          file.name,
          file.type,
          file.mimeType
        );
      }

      // Update file with generated metadata
      await storage.updateDriveFile(file.id, {
        status: 'processed',
        aiGeneratedMetadata: generatedMetadata,
        processingError: null
      });

    } catch (error) {
      console.error(`Failed to process file ${file.name}:`, error);
      await storage.updateDriveFile(file.id, {
        status: 'error',
        processingError: error.message
      });
      throw error;
    }
  }

  private async processImage(file: DriveFile, template?: MetadataTemplate): Promise<any> {
    try {
      // Get image content as base64
      const imageBuffer = await googleDriveService.getFileContent(file.driveId);
      const base64Image = imageBuffer.toString('base64');

      const metadataFields = template?.fields as any[] || [
        { name: 'description', description: 'Detailed description of the image content', type: 'text' },
        { name: 'keywords', description: 'Relevant keywords and tags', type: 'tags' },
        { name: 'category', description: 'General category or classification', type: 'text' },
        { name: 'mood', description: 'Mood or emotional tone of the image', type: 'text' }
      ];

      return await openAIService.analyzeImage(base64Image, metadataFields);
    } catch (error) {
      throw new Error(`Failed to process image: ${error.message}`);
    }
  }

  private async processPDF(file: DriveFile, template?: MetadataTemplate): Promise<any> {
    try {
      // Get PDF content and extract text
      const pdfBuffer = await googleDriveService.getFileContent(file.driveId);
      
      // Dynamically import pdf-parse to avoid startup issues
      const pdf = await import('pdf-parse');
      const pdfData = await pdf.default(pdfBuffer);
      const text = pdfData.text;

      const metadataFields = template?.fields as any[] || [
        { name: 'description', description: 'Summary of the document content', type: 'text' },
        { name: 'keywords', description: 'Key topics and terms from the document', type: 'tags' },
        { name: 'category', description: 'Document type or category', type: 'text' },
        { name: 'subject', description: 'Main subject or theme', type: 'text' }
      ];

      return await openAIService.analyzePDF(text, metadataFields);
    } catch (error) {
      throw new Error(`Failed to process PDF: ${error.message}`);
    }
  }

  private async processVideo(file: DriveFile, template?: MetadataTemplate): Promise<any> {
    try {
      // Get video metadata from Google Drive
      const driveMetadata = await googleDriveService.getFileMetadata(file.driveId);
      
      let thumbnailBase64: string | undefined;
      if (file.thumbnailLink) {
        try {
          // Note: In a real implementation, you'd need to fetch the thumbnail
          // For now, we'll process without thumbnail
          thumbnailBase64 = undefined;
        } catch (error) {
          console.warn('Could not fetch video thumbnail:', error.message);
        }
      }

      const metadataFields = template?.fields as any[] || [
        { name: 'description', description: 'Description of the video content', type: 'text' },
        { name: 'keywords', description: 'Relevant keywords and tags', type: 'tags' },
        { name: 'category', description: 'Video category or genre', type: 'text' },
        { name: 'mood', description: 'Mood or tone of the video', type: 'text' }
      ];

      return await openAIService.analyzeVideo(
        driveMetadata.videoMediaMetadata || {},
        thumbnailBase64,
        metadataFields
      );
    } catch (error) {
      throw new Error(`Failed to process video: ${error.message}`);
    }
  }

  async processBatch(folderId: string, templateId?: number): Promise<number> {
    try {
      // Create processing job
      const template = templateId ? await storage.getMetadataTemplate(templateId) : undefined;
      const files = await storage.getDriveFilesByFolder(folderId);
      
      const job = await storage.createProcessingJob({
        folderId,
        templateId: templateId || null,
        totalFiles: files.length,
        status: 'running'
      });

      let processed = 0;
      let failed = 0;

      // Process files one by one
      for (const file of files) {
        try {
          await this.processFile(file, template);
          processed++;
          
          // Add small delay to make progress visible to users
          await new Promise(resolve => setTimeout(resolve, 2000));
        } catch (error) {
          failed++;
          console.error(`Failed to process file ${file.name}:`, error);
        }

        // Update job progress
        await storage.updateProcessingJob(job.id, {
          processedFiles: processed,
          failedFiles: failed
        });
        
        console.log(`Batch processing progress: ${processed + failed}/${files.length} files processed`);
      }

      // Complete the job
      await storage.updateProcessingJob(job.id, {
        status: 'completed',
        completedAt: new Date()
      });

      return job.id;
    } catch (error) {
      throw new Error(`Failed to process batch: ${error.message}`);
    }
  }

  async exportMetadataToDrive(file: DriveFile): Promise<void> {
    try {
      if (!file.aiGeneratedMetadata) {
        throw new Error('No AI-generated metadata to export');
      }

      // Convert metadata to string properties for Google Drive
      const properties: Record<string, string> = {};
      
      Object.entries(file.aiGeneratedMetadata).forEach(([key, value]) => {
        // Sanitize the key to only contain allowed characters for Google Drive
        const sanitizedKey = `AI_${key}`.replace(/[^a-zA-Z0-9.!@$%^&*()\-_/]/g, '_');
        
        let stringValue: string;
        if (Array.isArray(value)) {
          // Convert arrays (like tags) to comma-separated strings
          stringValue = value.join(', ');
        } else {
          stringValue = String(value);
        }
        
        // Google Drive properties are limited to 124 bytes total (key + value)
        // Calculate available space for value (subtract key length and some buffer)
        const keyBytes = Buffer.byteLength(sanitizedKey, 'utf8');
        const maxValueBytes = 120 - keyBytes; // Leave 4 bytes buffer
        
        if (Buffer.byteLength(stringValue, 'utf8') <= maxValueBytes) {
          // Value fits in one property
          properties[sanitizedKey] = stringValue;
        } else {
          // Split long values into multiple properties
          let remaining = stringValue;
          let partIndex = 1;
          
          while (remaining.length > 0) {
            const partKey = `${sanitizedKey}_${partIndex}`;
            const partKeyBytes = Buffer.byteLength(partKey, 'utf8');
            const maxPartValueBytes = 120 - partKeyBytes;
            
            // Find a safe cut point that doesn't exceed byte limit
            let cutPoint = remaining.length;
            let testValue = remaining;
            
            while (Buffer.byteLength(testValue, 'utf8') > maxPartValueBytes && cutPoint > 0) {
              cutPoint = Math.floor(cutPoint * 0.8); // Reduce by 20% each time
              testValue = remaining.substring(0, cutPoint);
            }
            
            if (cutPoint === 0) {
              // Even a single character is too long, skip this part
              break;
            }
            
            properties[partKey] = testValue;
            remaining = remaining.substring(cutPoint);
            partIndex++;
            
            // Limit to prevent too many parts
            if (partIndex > 5) break;
          }
        }
      });

      // Add a timestamp for when metadata was generated (ensure it fits in 124 bytes)
      const timestamp = new Date().toISOString();
      const timestampKey = 'AI_Generated_At';
      if (Buffer.byteLength(timestampKey + timestamp, 'utf8') <= 120) {
        properties[timestampKey] = timestamp;
      }
      
      // Add source application (ensure it fits in 124 bytes)
      const appName = 'MetadataEnhancer';
      const appKey = 'AI_Generated_By';
      if (Buffer.byteLength(appKey + appName, 'utf8') <= 120) {
        properties[appKey] = appName;
      }

      await googleDriveService.updateFileProperties(file.driveId, properties);
      
      console.log(`Exported metadata to Google Drive for file: ${file.name}`);
    } catch (error) {
      console.error(`Failed to export metadata to Drive: ${error.message}`);
      throw error;
    }
  }

  async exportAllMetadataToDrive(folderId: string): Promise<number> {
    try {
      const files = await storage.getDriveFilesByFolder(folderId);
      const processedFiles = files.filter(f => f.status === 'processed' && f.aiGeneratedMetadata);
      
      let exported = 0;
      for (const file of processedFiles) {
        try {
          await this.exportMetadataToDrive(file);
          exported++;
        } catch (error) {
          console.error(`Failed to export metadata for ${file.name}:`, error);
        }
      }
      
      return exported;
    } catch (error) {
      throw new Error(`Failed to export batch metadata: ${error.message}`);
    }
  }
}

export const fileProcessorService = new FileProcessorService();
