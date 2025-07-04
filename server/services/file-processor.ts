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
      } else if (file.type === 'audio') {
        generatedMetadata = await this.processAudio(file, template);
      } else if (file.type === 'document' || this.isOfficeDocument(file.mimeType)) {
        generatedMetadata = await this.processDocument(file, template);
      } else {
        // For other file types, generate basic metadata
        generatedMetadata = await openAIService.generateDefaultMetadata(
          file.name,
          file.type,
          file.mimeType
        );
      }

      // Update file with generated metadata
      const updatedFile = await storage.updateDriveFile(file.id, {
        status: 'processed',
        aiGeneratedMetadata: generatedMetadata,
        processingError: null
      });

      // Automatically export metadata to Google Drive after successful processing
      if (updatedFile) {
        try {
          await this.exportMetadataToDrive(updatedFile);
        } catch (exportError) {
          console.error(`Failed to export metadata to Google Drive for file ${file.name}:`, (exportError as Error).message);
          // Don't fail the processing if export fails, just log the error
        }
      }

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
      console.log(`Processing PDF: ${file.name} (${file.driveId})`);
      
      // Download PDF content and extract text
      const pdfBuffer = await googleDriveService.getFileContent(file.driveId);
      console.log(`PDF buffer size: ${pdfBuffer.length} bytes`);
      
      if (pdfBuffer.length === 0) {
        throw new Error('PDF file is empty or could not be downloaded');
      }
      
      let extractedText = '';
      
      try {
        // Use pdf2pic to convert PDF to images and then extract text using OCR-like approach
        // First try to extract text using a simple text extraction method
        const fs = require('fs');
        const path = require('path');
        const tempPdfPath = path.join('/tmp', `temp_${Date.now()}.pdf`);
        
        // Write buffer to temporary file
        fs.writeFileSync(tempPdfPath, pdfBuffer);
        
        // Try to use poppler utils for text extraction if available
        try {
          const { exec } = require('child_process');
          const { promisify } = require('util');
          const execAsync = promisify(exec);
          
          // Try pdftotext command
          const { stdout } = await execAsync(`pdftotext "${tempPdfPath}" -`);
          extractedText = stdout.trim();
          console.log(`Extracted text using pdftotext: ${extractedText.length} characters`);
        } catch (pdfTextError) {
          console.log('pdftotext not available, using alternative approach');
          
          // Fallback: Use pdf2pic to convert to images for analysis
          const pdf2pic = require('pdf2pic');
          const convert = pdf2pic.fromBuffer(pdfBuffer, {
            density: 100,
            saveFilename: 'page',
            savePath: '/tmp',
            format: 'png',
            width: 800,
            height: 1200
          });
          
          try {
            const results = await convert.bulk(-1, { responseType: 'base64' });
            console.log(`Converted PDF to ${results.length} images`);
            
            // Analyze first few pages with OCR-like capabilities using OpenAI Vision
            const imagePages = results.slice(0, 3); // Analyze first 3 pages
            for (const result of imagePages) {
              try {
                const pageAnalysis = await openAIService.analyzeImage(result.base64, [
                  { name: 'text_content', description: 'All readable text from this page', type: 'text' }
                ]);
                if (pageAnalysis.text_content) {
                  extractedText += pageAnalysis.text_content + '\n\n';
                }
              } catch (pageError) {
                console.log('Failed to analyze page:', pageError);
              }
            }
          } catch (conversionError) {
            console.log('PDF to image conversion failed:', conversionError);
          }
        }
        
        // Clean up temporary file
        try {
          fs.unlinkSync(tempPdfPath);
        } catch (cleanupError) {
          console.log('Failed to cleanup temp file:', cleanupError);
        }
        
      } catch (extractionError) {
        console.log('Text extraction failed:', extractionError);
      }
      
      const metadataFields = template?.fields as any[] || [
        { name: 'title', description: 'Document title', type: 'text' },
        { name: 'description', description: 'Comprehensive summary of document content', type: 'text' },
        { name: 'keywords', description: 'Key terms and topics from the document', type: 'tags' },
        { name: 'category', description: 'Document category (report, manual, academic, etc.)', type: 'text' },
        { name: 'subject', description: 'Main subject or domain', type: 'text' },
        { name: 'document_type', description: 'Type of document (research paper, manual, report, etc.)', type: 'text' },
        { name: 'key_points', description: 'Main points or conclusions from the document', type: 'text' },
        { name: 'author_info', description: 'Author or organization information if mentioned', type: 'text' }
      ];

      if (extractedText && extractedText.trim().length > 50) {
        console.log(`Analyzing PDF with extracted text: ${extractedText.length} characters`);
        return await openAIService.analyzePDF(extractedText, metadataFields);
      } else {
        console.log('Insufficient text extracted, using filename-based analysis');
        const enhancedContext = {
          filename: file.name,
          fileSize: file.size,
          mimeType: file.mimeType,
          createdTime: file.createdTime,
          modifiedTime: file.modifiedTime,
          fileType: 'PDF Document'
        };
        return await openAIService.analyzeDocumentByContext(enhancedContext, metadataFields);
      }
    } catch (error) {
      console.error(`PDF processing error for ${file.name}:`, error);
      throw new Error(`Failed to process PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async processVideo(file: DriveFile, template?: MetadataTemplate): Promise<any> {
    try {
      // Get video metadata from Google Drive
      const driveMetadata = await googleDriveService.getFileMetadata(file.driveId);
      
      let thumbnailBase64: string | undefined;
      let videoFrames: string[] = [];
      let transcript: string = '';
      
      // Try to get thumbnail from Google Drive
      if (file.thumbnailLink) {
        try {
          const thumbnailResponse = await fetch(file.thumbnailLink, {
            headers: {
              'Authorization': `Bearer ${await googleDriveService.getAccessToken()}`
            }
          });
          
          if (thumbnailResponse.ok) {
            const thumbnailBuffer = Buffer.from(await thumbnailResponse.arrayBuffer());
            thumbnailBase64 = thumbnailBuffer.toString('base64');
            console.log(`Successfully fetched thumbnail for video: ${file.name}`);
          }
        } catch (error) {
          console.warn('Could not fetch video thumbnail:', (error as Error).message);
        }
      }

      // Download video for advanced processing
      try {
        const videoBuffer = await googleDriveService.getFileContent(file.driveId);
        console.log(`Downloaded video file: ${file.name} (${videoBuffer.length} bytes)`);

        // Extract multiple frames for comprehensive analysis
        videoFrames = await this.extractVideoFrames(videoBuffer, file.name);
        console.log(`Extracted ${videoFrames.length} frames from video: ${file.name}`);

        // Extract and transcribe audio
        try {
          const audioBuffer = await this.extractAudioFromVideo(videoBuffer, file.name);
          if (audioBuffer) {
            transcript = await openAIService.transcribeAudio(audioBuffer);
            console.log(`Transcribed audio for video: ${file.name} (${transcript.length} characters)`);
          }
        } catch (audioError) {
          console.warn(`Audio extraction/transcription failed for ${file.name}:`, (audioError as Error).message);
        }

      } catch (downloadError) {
        console.warn(`Could not download video for advanced processing: ${(downloadError as Error).message}`);
      }

      const metadataFields = template?.fields as any[] || [
        { name: 'description', description: 'Comprehensive description of the video content, activities, and context', type: 'text' },
        { name: 'keywords', description: 'Specific and relevant keywords based on visual and audio content', type: 'tags' },
        { name: 'category', description: 'Video category, genre, or content type', type: 'text' },
        { name: 'mood', description: 'Emotional tone, mood, or atmosphere of the video', type: 'text' },
        { name: 'themes', description: 'Main themes, topics, or subjects covered', type: 'tags' },
        { name: 'people', description: 'People, speakers, or participants visible or mentioned', type: 'tags' },
        { name: 'objects', description: 'Key objects, products, or items shown in the video', type: 'tags' },
        { name: 'activities', description: 'Activities, actions, or events taking place', type: 'tags' },
        { name: 'setting', description: 'Location, environment, or setting of the video', type: 'text' },
        { name: 'quality', description: 'Production quality and style assessment', type: 'text' }
      ];

      // Enhanced video metadata context
      const videoContext = {
        ...driveMetadata.videoMediaMetadata,
        fileName: file.name,
        fileSize: driveMetadata.size,
        createdTime: file.createdTime,
        modifiedTime: file.modifiedTime,
        mimeType: file.mimeType
      };

      return await openAIService.analyzeVideo(
        videoContext,
        thumbnailBase64,
        metadataFields,
        videoFrames.length > 0 ? videoFrames : undefined,
        transcript || undefined
      );
    } catch (error) {
      throw new Error(`Failed to process video: ${error.message}`);
    }
  }

  private isOfficeDocument(mimeType: string): boolean {
    const officeMimeTypes = [
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
      'application/vnd.openxmlformats-officedocument.presentationml.presentation', // .pptx
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
      'application/vnd.ms-word', // .doc
      'application/vnd.ms-powerpoint', // .ppt
      'application/vnd.ms-excel', // .xls
      'application/msword',
      'text/plain', // .txt
      'application/rtf' // .rtf
    ];
    return officeMimeTypes.includes(mimeType);
  }

  private async processDocument(file: DriveFile, template?: MetadataTemplate): Promise<any> {
    try {
      console.log(`Processing document: ${file.name} (${file.driveId})`);
      
      // Download document content
      const documentBuffer = await googleDriveService.getFileContent(file.driveId);
      console.log(`Document buffer size: ${documentBuffer.length} bytes`);
      
      if (documentBuffer.length === 0) {
        throw new Error('Document file is empty or could not be downloaded');
      }
      
      let extractedText = '';
      
      try {
        if (file.mimeType.includes('wordprocessingml') || file.name.toLowerCase().endsWith('.docx')) {
          // Process Word documents using mammoth
          const mammoth = require('mammoth');
          const result = await mammoth.extractRawText({ buffer: documentBuffer });
          extractedText = result.value;
          console.log(`Extracted text from Word document: ${extractedText.length} characters`);
          
        } else if (file.mimeType.includes('presentationml') || file.name.toLowerCase().endsWith('.pptx')) {
          // Process PowerPoint presentations
          // For PPTX, we'll use a simpler approach since full text extraction is complex
          const fs = require('fs');
          const path = require('path');
          const tempFilePath = path.join('/tmp', `temp_${Date.now()}.pptx`);
          
          try {
            fs.writeFileSync(tempFilePath, documentBuffer);
            
            // Try to use unzip to extract text from PPTX (which is essentially a ZIP file)
            const { exec } = require('child_process');
            const { promisify } = require('util');
            const execAsync = promisify(exec);
            
            try {
              // Extract slide text from PPTX XML content
              const { stdout } = await execAsync(`unzip -p "${tempFilePath}" ppt/slides/*.xml | grep -oP '(?<=<a:t>)[^<]+' | head -50`);
              extractedText = stdout.replace(/\n/g, ' ').trim();
              console.log(`Extracted text from PowerPoint: ${extractedText.length} characters`);
            } catch (extractError) {
              console.log('PowerPoint text extraction failed, using filename-based analysis');
            }
            
            fs.unlinkSync(tempFilePath);
          } catch (tempError) {
            console.log('PowerPoint processing error:', tempError);
          }
          
        } else if (file.mimeType.includes('spreadsheetml') || file.name.toLowerCase().endsWith('.xlsx')) {
          // Process Excel spreadsheets
          const xlsx = require('xlsx');
          const workbook = xlsx.read(documentBuffer, { type: 'buffer' });
          const sheetNames = workbook.SheetNames;
          
          let allText = '';
          sheetNames.slice(0, 3).forEach(sheetName => { // Process first 3 sheets
            const worksheet = workbook.Sheets[sheetName];
            const sheetText = xlsx.utils.sheet_to_txt(worksheet);
            allText += `Sheet ${sheetName}:\n${sheetText}\n\n`;
          });
          
          extractedText = allText;
          console.log(`Extracted text from Excel: ${extractedText.length} characters`);
          
        } else if (file.mimeType === 'text/plain') {
          // Process plain text files
          extractedText = documentBuffer.toString('utf-8');
          console.log(`Extracted text from plain text file: ${extractedText.length} characters`);
          
        } else {
          console.log('Unsupported document type, using filename-based analysis');
        }
      } catch (extractionError) {
        console.log('Document text extraction failed:', extractionError);
      }
      
      const metadataFields = template?.fields as any[] || [
        { name: 'title', description: 'Document title or main heading', type: 'text' },
        { name: 'description', description: 'Comprehensive summary of document content', type: 'text' },
        { name: 'keywords', description: 'Key terms and topics from the document', type: 'tags' },
        { name: 'category', description: 'Document category (report, presentation, manual, etc.)', type: 'text' },
        { name: 'subject', description: 'Main subject or domain', type: 'text' },
        { name: 'document_type', description: 'Type of document (business plan, research, presentation, etc.)', type: 'text' },
        { name: 'key_points', description: 'Main points or takeaways from the document', type: 'text' },
        { name: 'target_audience', description: 'Intended audience for this document', type: 'text' },
        { name: 'content_structure', description: 'Overview of document structure and organization', type: 'text' }
      ];

      if (extractedText && extractedText.trim().length > 50) {
        console.log(`Analyzing document with extracted text: ${extractedText.length} characters`);
        // Truncate very long text to avoid token limits
        const truncatedText = extractedText.length > 8000 ? extractedText.substring(0, 8000) + '...' : extractedText;
        return await openAIService.analyzePDF(truncatedText, metadataFields); // Reuse PDF analysis method
      } else {
        console.log('Insufficient text extracted, using filename-based analysis');
        const enhancedContext = {
          filename: file.name,
          fileSize: file.size,
          mimeType: file.mimeType,
          createdTime: file.createdTime,
          modifiedTime: file.modifiedTime,
          fileType: this.getDocumentType(file.mimeType)
        };
        return await openAIService.analyzeDocumentByContext(enhancedContext, metadataFields);
      }
    } catch (error) {
      console.error(`Document processing error for ${file.name}:`, error);
      throw new Error(`Failed to process document: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private getDocumentType(mimeType: string): string {
    if (mimeType.includes('wordprocessingml') || mimeType.includes('msword')) return 'Word Document';
    if (mimeType.includes('presentationml') || mimeType.includes('ms-powerpoint')) return 'PowerPoint Presentation';
    if (mimeType.includes('spreadsheetml') || mimeType.includes('ms-excel')) return 'Excel Spreadsheet';
    if (mimeType === 'text/plain') return 'Text Document';
    if (mimeType === 'application/rtf') return 'RTF Document';
    return 'Office Document';
  }

  private async processAudio(file: DriveFile, template?: MetadataTemplate): Promise<any> {
    try {
      // Get audio content
      const audioBuffer = await googleDriveService.getFileContent(file.driveId);
      
      let transcript = '';
      try {
        transcript = await openAIService.transcribeAudio(audioBuffer);
        console.log(`Transcribed audio for: ${file.name} (${transcript.length} characters)`);
      } catch (transcriptionError) {
        console.warn(`Audio transcription failed for ${file.name}:`, (transcriptionError as Error).message);
      }

      const metadataFields = template?.fields as any[] || [
        { name: 'description', description: 'Description of the audio content and topic', type: 'text' },
        { name: 'keywords', description: 'Key topics and terms from the audio', type: 'tags' },
        { name: 'category', description: 'Audio category (music, podcast, speech, etc.)', type: 'text' },
        { name: 'mood', description: 'Tone or mood of the audio content', type: 'text' },
        { name: 'speakers', description: 'Speakers or performers identified', type: 'tags' },
        { name: 'topics', description: 'Main topics or subjects discussed', type: 'tags' },
        { name: 'language', description: 'Primary language of the audio', type: 'text' },
        { name: 'genre', description: 'Genre or style classification', type: 'text' }
      ];

      // Create context for AI analysis
      const audioContext = {
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.mimeType,
        transcript: transcript || 'Transcription not available',
        duration: 'Duration unknown'
      };

      return await openAIService.analyzeAudio(audioContext, metadataFields);
    } catch (error) {
      throw new Error(`Failed to process audio: ${error.message}`);
    }
  }

  private async extractVideoFrames(videoBuffer: Buffer, fileName: string): Promise<string[]> {
    try {
      // Dynamically import fluent-ffmpeg for video processing
      const ffmpeg = await import('fluent-ffmpeg');
      const fs = await import('fs');
      const path = await import('path');
      const { promisify } = await import('util');
      const writeFile = promisify(fs.writeFile);
      const readFile = promisify(fs.readFile);
      const unlink = promisify(fs.unlink);

      const tempDir = '/tmp';
      const tempVideoPath = path.join(tempDir, `temp_video_${Date.now()}.mp4`);
      const frames: string[] = [];

      // Write video buffer to temporary file
      await writeFile(tempVideoPath, videoBuffer);

      // Extract frames at different timestamps (beginning, middle, end, plus a few more)
      const timestamps = ['00:00:01', '25%', '50%', '75%', '95%'];
      
      for (let i = 0; i < Math.min(timestamps.length, 5); i++) {
        const timestamp = timestamps[i];
        const framePath = path.join(tempDir, `frame_${Date.now()}_${i}.jpg`);
        
        try {
          await new Promise<void>((resolve, reject) => {
            ffmpeg.default(tempVideoPath)
              .screenshots({
                timestamps: [timestamp],
                filename: path.basename(framePath),
                folder: tempDir,
                size: '640x480'
              })
              .on('end', () => resolve())
              .on('error', (err) => reject(err));
          });

          const frameBuffer = await readFile(framePath);
          frames.push(frameBuffer.toString('base64'));
          
          // Clean up frame file
          await unlink(framePath);
        } catch (frameError) {
          console.warn(`Failed to extract frame at ${timestamp}:`, (frameError as Error).message);
        }
      }

      // Clean up temporary video file
      await unlink(tempVideoPath);
      
      return frames;
    } catch (error) {
      console.warn(`Frame extraction failed for ${fileName}:`, (error as Error).message);
      return [];
    }
  }

  private async extractAudioFromVideo(videoBuffer: Buffer, fileName: string): Promise<Buffer | null> {
    try {
      // Dynamically import fluent-ffmpeg for audio extraction
      const ffmpeg = await import('fluent-ffmpeg');
      const fs = await import('fs');
      const path = await import('path');
      const { promisify } = await import('util');
      const writeFile = promisify(fs.writeFile);
      const readFile = promisify(fs.readFile);
      const unlink = promisify(fs.unlink);

      const tempDir = '/tmp';
      const tempVideoPath = path.join(tempDir, `temp_video_${Date.now()}.mp4`);
      const tempAudioPath = path.join(tempDir, `temp_audio_${Date.now()}.mp3`);

      // Write video buffer to temporary file
      await writeFile(tempVideoPath, videoBuffer);

      // Extract audio using ffmpeg
      await new Promise<void>((resolve, reject) => {
        ffmpeg.default(tempVideoPath)
          .output(tempAudioPath)
          .audioCodec('mp3')
          .audioFrequency(16000)
          .audioChannels(1)
          .duration(300) // Limit to first 5 minutes to manage costs
          .on('end', () => resolve())
          .on('error', (err) => reject(err))
          .run();
      });

      const audioBuffer = await readFile(tempAudioPath);
      
      // Clean up temporary files
      await unlink(tempVideoPath);
      await unlink(tempAudioPath);
      
      return audioBuffer;
    } catch (error) {
      console.warn(`Audio extraction failed for ${fileName}:`, (error as Error).message);
      return null;
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

      // First, get existing metadata from Google Drive to compare
      const existingDriveMetadata = await googleDriveService.getFileMetadata(file.driveId);
      const existingProperties = existingDriveMetadata.properties || {};

      // Convert AI metadata to the format that would be stored in Drive
      const newProperties: Record<string, string> = {};
      
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
          newProperties[sanitizedKey] = stringValue;
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
            
            newProperties[partKey] = testValue;
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
        newProperties[timestampKey] = timestamp;
      }
      
      // Add source application (ensure it fits in 124 bytes)
      const appName = 'MetadataEnhancer';
      const appKey = 'AI_Generated_By';
      if (Buffer.byteLength(appKey + appName, 'utf8') <= 120) {
        newProperties[appKey] = appName;
      }

      // Compare new properties with existing ones
      let hasChanges = false;
      
      // Check if any new property is different from existing
      for (const [key, value] of Object.entries(newProperties)) {
        if (existingProperties[key] !== value) {
          hasChanges = true;
          break;
        }
      }
      
      // Check if any existing AI properties are no longer present
      if (!hasChanges) {
        for (const key of Object.keys(existingProperties)) {
          if (key.startsWith('AI_') && !(key in newProperties)) {
            hasChanges = true;
            break;
          }
        }
      }

      if (!hasChanges) {
        console.log(`Metadata for file "${file.name}" is already up to date, skipping export`);
        return;
      }

      console.log(`Exporting AI metadata to Google Drive for "${file.name}":`, newProperties);
      // Only export if there are changes
      await googleDriveService.updateFileProperties(file.driveId, newProperties);
      console.log(`Successfully exported AI metadata for "${file.name}" to Google Drive`);
      
      console.log(`Exported updated metadata to Google Drive for file: ${file.name}`);
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
      let skipped = 0;
      
      for (const file of processedFiles) {
        try {
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
            await this.exportMetadataToDrive(file);
            exported++;
          } else {
            skipped++;
          }
        } catch (error) {
          console.error(`Failed to export metadata for ${file.name}:`, error);
        }
      }
      
      console.log(`Batch export completed: ${exported} files exported, ${skipped} files skipped (no changes)`);
      return exported;
    } catch (error) {
      throw new Error(`Failed to export batch metadata: ${error.message}`);
    }
  }
}

export const fileProcessorService = new FileProcessorService();
