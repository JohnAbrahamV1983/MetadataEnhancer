import OpenAI from "openai";
import { storage } from "../storage";
import { DriveFile } from "@shared/schema";

// the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

interface AgenticSearchResult {
  files: DriveFile[];
  reasoning: string;
  searchQuery: string;
  totalResults: number;
}

export class AgenticSearchService {
  async getAllFilesRecursively(folderId: string): Promise<DriveFile[]> {
    if (folderId === "root") {
      return await storage.getAllDriveFiles();
    }

    const files: DriveFile[] = [];
    const processedFolders = new Set<string>();
    const foldersToProcess = [folderId];

    while (foldersToProcess.length > 0) {
      const currentFolderId = foldersToProcess.shift()!;
      
      if (processedFolders.has(currentFolderId)) {
        continue;
      }
      processedFolders.add(currentFolderId);

      // First, ensure all files in this folder are discovered and synced to our database
      try {
        const { googleDriveService } = await import('./google-drive');
        const driveFiles = await googleDriveService.listFiles(currentFolderId);
        
        // Check each file and add to database if not already present
        for (const driveFile of driveFiles) {
          let storedFile = await storage.getDriveFileByDriveId(driveFile.id);
          
          if (!storedFile) {
            // File not in database, add it
            storedFile = await storage.createDriveFile({
              driveId: driveFile.id,
              name: driveFile.name,
              type: googleDriveService.getFileType(driveFile.mimeType),
              size: parseInt(driveFile.size || '0'),
              mimeType: driveFile.mimeType,
              parentFolderId: driveFile.parents?.[0] || currentFolderId,
              webViewLink: driveFile.webViewLink,
              thumbnailLink: driveFile.thumbnailLink,
              createdTime: new Date(driveFile.createdTime),
              modifiedTime: new Date(driveFile.modifiedTime),
              status: 'pending'
            });
          }
          
          // Always try to restore AI metadata from Google Drive properties if not already present
          if (!storedFile.aiGeneratedMetadata || Object.keys(storedFile.aiGeneratedMetadata as any).length === 0) {
            try {
              // First try using properties from the listFiles response
              let properties = driveFile.properties;
              
              // If not available in the list response, fetch individual file metadata
              if (!properties) {
                const metadata = await googleDriveService.getFileMetadata(driveFile.id);
                properties = metadata.properties;
              }
              
              if (properties) {
                const aiGeneratedMetadata: any = {};
                let hasAiMetadata = false;
                
                for (const [key, value] of Object.entries(properties)) {
                  if (key.startsWith('AI_') && value) {
                    try {
                      // Try to parse JSON values, fallback to string
                      const cleanKey = key.replace('AI_', '');
                      // Handle arrays (tags) and other data types
                      if (cleanKey === 'tags' && typeof value === 'string') {
                        try {
                          aiGeneratedMetadata[cleanKey] = JSON.parse(value);
                        } catch {
                          aiGeneratedMetadata[cleanKey] = value.split(',').map((tag: string) => tag.trim());
                        }
                      } else {
                        aiGeneratedMetadata[cleanKey] = value;
                      }
                      hasAiMetadata = true;
                    } catch (parseError) {
                      // If JSON parsing fails, use raw value
                      const cleanKey = key.replace('AI_', '');
                      aiGeneratedMetadata[cleanKey] = value;
                      hasAiMetadata = true;
                    }
                  }
                }
                
                if (hasAiMetadata) {
                  storedFile = await storage.updateDriveFile(storedFile.id, {
                    aiGeneratedMetadata: aiGeneratedMetadata,
                    status: 'processed'
                  }) || storedFile;
                }
              }
            } catch (error) {
              // Continue even if metadata restoration fails
            }
          }
          
          files.push(storedFile);
        }
        
        // Get subfolders and add them to processing queue
        const subFolders = await googleDriveService.listFolders(currentFolderId);
        for (const subFolder of subFolders) {
          if (!processedFolders.has(subFolder.id)) {
            foldersToProcess.push(subFolder.id);
          }
        }
      } catch (error) {
        console.warn(`Could not access folder ${currentFolderId}:`, error.message);
        // Fallback to database-only search for this folder
        const folderFiles = await storage.getDriveFilesByFolder(currentFolderId);
        files.push(...folderFiles);
      }
    }

    return files;
  }

  async performAgenticSearch(userQuery: string, folderId?: string): Promise<AgenticSearchResult> {
    try {
      // Get files from storage - recursively search through folders if specified
      const allFiles = folderId && folderId !== "root" 
        ? await this.getAllFilesRecursively(folderId)
        : await storage.getAllDriveFiles();
      
      // Filter files that have been processed and have AI metadata
      const processedFiles = allFiles.filter(file => 
        file.status === 'processed' && 
        file.aiGeneratedMetadata && 
        Object.keys(file.aiGeneratedMetadata as any).length > 0
      );

      // If no processed files, include all files for basic search
      const searchableFiles = processedFiles.length > 0 ? processedFiles : allFiles;

      if (searchableFiles.length === 0) {
        return {
          files: [],
          reasoning: "No files found in the selected folder. Please make sure files have been uploaded to Google Drive.",
          searchQuery: userQuery,
          totalResults: 0
        };
      }

      // Create a comprehensive metadata summary for AI analysis
      const fileMetadataSummary = searchableFiles.map(file => ({
        id: file.id,
        name: file.name,
        type: file.type,
        mimeType: file.mimeType,
        aiMetadata: file.aiGeneratedMetadata,
        existingMetadata: file.existingMetadata,
        status: file.status,
        createdTime: file.createdTime,
        modifiedTime: file.modifiedTime
      }));

      // Use OpenAI to understand the query and find relevant files
      const analysisPrompt = `
You are an intelligent file search assistant. Analyze the user's natural language query and find the most relevant files from the provided metadata.

User Query: "${userQuery}"

Available Files Metadata:
${JSON.stringify(fileMetadataSummary, null, 2)}

Instructions:
1. Understand the user's intent from their natural language query
2. Analyze which files best match their request based on:
   - File names and types (prioritize relevant file extensions)
   - AI-generated metadata (descriptions, objects, text, tags, etc.) if available
   - File creation/modification dates for time-based queries
   - File status (processed files with AI metadata are generally more relevant)
3. Return a JSON response with:
   - "relevantFileIds": array of file IDs that match the query (ordered by relevance)
   - "reasoning": explanation of why these files were selected and how you interpreted the query
   - "confidence": number from 0-1 indicating confidence in the results

Consider semantic meaning, not just keyword matching. For example:
- "photos with people" should match image files (jpg, png) with "person", "people", "human", "faces" in metadata OR image files with names containing "Image", "Photo", "IMG" even without AI metadata
- "business documents" might match PDFs with "business", "report", "proposal", "contract" content OR document files with relevant names
- "files from last month" should consider creation dates
- "videos about cars" should match video files with "car", "vehicle", "automobile" descriptions OR video files in general

Note: Some files may not have AI-generated metadata yet (status: "pending") but can still be relevant based on filename, type, and dates.

Return only valid JSON.
`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{
          role: "user",
          content: analysisPrompt
        }],
        response_format: { type: "json_object" },
        temperature: 0.3
      });

      const aiResponse = JSON.parse(response.choices[0].message.content || '{}');
      
      // Get the relevant files based on AI analysis
      const relevantFileIds = aiResponse.relevantFileIds || [];
      const matchingFiles = searchableFiles.filter(file => 
        relevantFileIds.includes(file.id)
      );

      // Sort files by the order returned by AI (most relevant first)
      const sortedFiles = relevantFileIds
        .map((id: number) => searchableFiles.find(file => file.id === id))
        .filter(Boolean);

      return {
        files: sortedFiles,
        reasoning: aiResponse.reasoning || "AI analysis completed based on your query and available file metadata.",
        searchQuery: userQuery,
        totalResults: sortedFiles.length
      };

    } catch (error) {
      console.error('Agentic search error:', error);
      
      // Fallback to simple keyword search if AI fails
      const fallbackFiles = folderId && folderId !== "root" 
        ? await this.getAllFilesRecursively(folderId)
        : await storage.getAllDriveFiles();
      const keywords = userQuery.toLowerCase().split(' ');
      
      const matchingFiles = fallbackFiles.filter(file => {
        const searchableText = [
          file.name,
          file.type,
          JSON.stringify(file.aiGeneratedMetadata || {}),
          JSON.stringify(file.existingMetadata || {})
        ].join(' ').toLowerCase();
        
        return keywords.some(keyword => searchableText.includes(keyword));
      });

      return {
        files: matchingFiles,
        reasoning: `AI analysis failed, performed fallback keyword search for: ${userQuery}. Consider checking your OpenAI API connection.`,
        searchQuery: userQuery,
        totalResults: matchingFiles.length
      };
    }
  }
}

export const agenticSearchService = new AgenticSearchService();