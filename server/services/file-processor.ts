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
}

export const fileProcessorService = new FileProcessorService();
