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
  async performAgenticSearch(userQuery: string): Promise<AgenticSearchResult> {
    try {
      // Get all files from storage
      const allFiles = await storage.getAllDriveFiles();
      
      // Filter files that have been processed and have AI metadata
      const processedFiles = allFiles.filter(file => 
        file.status === 'processed' && 
        file.aiGeneratedMetadata && 
        Object.keys(file.aiGeneratedMetadata as any).length > 0
      );

      if (processedFiles.length === 0) {
        return {
          files: [],
          reasoning: "No files have been processed with AI metadata yet. Please process some files first to enable agentic search.",
          searchQuery: userQuery,
          totalResults: 0
        };
      }

      // Create a comprehensive metadata summary for AI analysis
      const fileMetadataSummary = processedFiles.map(file => ({
        id: file.id,
        name: file.name,
        type: file.type,
        mimeType: file.mimeType,
        aiMetadata: file.aiGeneratedMetadata,
        existingMetadata: file.existingMetadata
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
   - File names and types
   - AI-generated metadata (descriptions, objects, text, tags, etc.)
   - Existing metadata properties
3. Return a JSON response with:
   - "relevantFileIds": array of file IDs that match the query (ordered by relevance)
   - "reasoning": explanation of why these files were selected and how you interpreted the query
   - "confidence": number from 0-1 indicating confidence in the results

Consider semantic meaning, not just keyword matching. For example:
- "photos with people" should match images with "person", "people", "human", "faces" in metadata
- "business documents" might match PDFs with "business", "report", "proposal", "contract" content
- "files from last month" should consider creation dates
- "videos about cars" should match video files with "car", "vehicle", "automobile" descriptions

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
      const matchingFiles = processedFiles.filter(file => 
        relevantFileIds.includes(file.id)
      );

      // Sort files by the order returned by AI (most relevant first)
      const sortedFiles = relevantFileIds
        .map((id: number) => processedFiles.find(file => file.id === id))
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
      const allFiles = await storage.getAllDriveFiles();
      const keywords = userQuery.toLowerCase().split(' ');
      
      const matchingFiles = allFiles.filter(file => {
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