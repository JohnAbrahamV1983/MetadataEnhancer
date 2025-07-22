import OpenAI from "openai";

// the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY_ENV_VAR || ""
});

interface MetadataField {
  name: string;
  description: string;
  type: 'text' | 'select' | 'tags';
  options?: string[];
}

interface GeneratedMetadata {
  [key: string]: any;
}

export class OpenAIService {
  async analyzeImage(base64Image: string, metadataFields: MetadataField[]): Promise<GeneratedMetadata> {
    try {
      const fieldDescriptions = metadataFields.map(field => 
        `${field.name}: ${field.description} (${field.type}${field.options ? `, options: ${field.options.join(', ')}` : ''})`
      ).join('\n');

      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `You are an expert image analyst. Analyze the provided image and generate metadata based on the specified fields. Return your response as JSON with the field names as keys.

Metadata Fields:
${fieldDescriptions}

For each field, provide appropriate values based on the image content. For 'tags' type fields, return an array of relevant tags. For 'select' type fields, choose from the provided options or suggest similar values if none fit perfectly.`
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Analyze this image and generate metadata for the specified fields."
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:image/jpeg;base64,${base64Image}`
                }
              }
            ],
          },
        ],
        response_format: { type: "json_object" },
        max_tokens: 1000,
      });

      return JSON.parse(response.choices[0].message.content || '{}');
    } catch (error) {
      throw new Error(`Failed to analyze image: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async analyzePDF(text: string, metadataFields: MetadataField[]): Promise<GeneratedMetadata> {
    try {
      const fieldDescriptions = metadataFields.map(field => 
        `${field.name}: ${field.description} (${field.type}${field.options ? `, options: ${field.options.join(', ')}` : ''})`
      ).join('\n');

      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `You are an expert document analyst. Analyze the provided PDF text content and generate metadata based on the specified fields. Return your response as JSON with the field names as keys.

Metadata Fields:
${fieldDescriptions}

For each field, provide appropriate values based on the document content. For 'tags' type fields, return an array of relevant tags. For 'select' type fields, choose from the provided options or suggest similar values if none fit perfectly.`
          },
          {
            role: "user",
            content: `Analyze this PDF content and generate metadata for the specified fields:\n\n${text.substring(0, 4000)}`
          }
        ],
        response_format: { type: "json_object" },
        max_tokens: 1000,
      });

      return JSON.parse(response.choices[0].message.content || '{}');
    } catch (error) {
      throw new Error(`Failed to analyze PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async analyzeVideo(metadata: any, thumbnailBase64?: string, metadataFields?: MetadataField[], videoFrames?: string[], transcript?: string): Promise<GeneratedMetadata> {
    try {
      const fieldDescriptions = metadataFields?.map(field => 
        `${field.name}: ${field.description} (${field.type}${field.options ? `, options: ${field.options.join(', ')}` : ''})`
      ).join('\n') || '';

      let messages: any[] = [
        {
          role: "system",
          content: `You are an expert video content analyst. Your task is to analyze video files and generate comprehensive, intelligent metadata based on visual content and audio transcription.

${fieldDescriptions ? `Required Metadata Fields:\n${fieldDescriptions}\n` : 'Generate comprehensive metadata including description, keywords, category, mood, themes, objects, people, activities, and context.\n'}

Analysis Capabilities:
- Deep visual analysis of video frames to identify objects, people, activities, settings, and context
- Transcript analysis to understand spoken content, topics, and themes
- Temporal understanding of how content evolves throughout the video
- Scene and activity recognition
- Emotional tone and mood analysis
- Technical quality assessment

Analysis Guidelines:
- Provide detailed, specific descriptions based on actual visual and audio content
- Identify key themes, topics, and subjects discussed or shown
- Describe visual elements: people, objects, settings, actions, text overlays
- Note any educational, entertainment, business, or personal content
- Analyze the production quality and style (professional, casual, documentary, etc.)
- Generate highly relevant and specific keywords
- Be comprehensive but accurate - only describe what you can actually observe

Return your response as JSON with the field names as keys.`
        }
      ];

      const videoInfo = {
        filename: metadata.fileName || 'Unknown',
        duration: metadata.durationMillis ? `${Math.round(metadata.durationMillis / 1000 / 60)} minutes` : 'Unknown duration',
        dimensions: metadata.width && metadata.height ? `${metadata.width}x${metadata.height}` : 'Unknown resolution',
        fileSize: metadata.fileSize ? `${Math.round(metadata.fileSize / 1024 / 1024)} MB` : 'Unknown size',
        createdTime: metadata.createdTime || 'Unknown',
        mimeType: metadata.mimeType || 'Unknown'
      };

      let contentAnalysisText = `Analyze this video file comprehensively:

Video Information:
- Filename: ${videoInfo.filename}
- Duration: ${videoInfo.duration}
- Resolution: ${videoInfo.dimensions}
- File Size: ${videoInfo.fileSize}
- Created: ${videoInfo.createdTime}
- Type: ${videoInfo.mimeType}

`;

      // Add transcript analysis if available
      if (transcript && transcript.trim()) {
        contentAnalysisText += `Audio Transcript:
${transcript}

`;
      }

      const userContent: any[] = [{
        type: "text",
        text: contentAnalysisText + `Based on the ${videoFrames && videoFrames.length > 0 ? 'video frames' : 'thumbnail'}${transcript ? ' and transcript' : ''}, provide detailed and comprehensive metadata that accurately describes the video content, themes, activities, and context.`
      }];

      // Add video frames for comprehensive visual analysis
      if (videoFrames && videoFrames.length > 0) {
        videoFrames.forEach((frameBase64, index) => {
          userContent.push({
            type: "image_url",
            image_url: {
              url: `data:image/jpeg;base64,${frameBase64}`
            }
          });
        });
      } else if (thumbnailBase64) {
        // Fallback to thumbnail if no frames extracted
        userContent.push({
          type: "image_url",
          image_url: {
            url: `data:image/jpeg;base64,${thumbnailBase64}`
          }
        });
      }

      messages.push({
        role: "user",
        content: userContent
      });

      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages,
        response_format: { type: "json_object" },
        max_tokens: 1500, // Increased for more detailed analysis
      });

      return JSON.parse(response.choices[0].message.content || '{}');
    } catch (error) {
      throw new Error(`Failed to analyze video: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async transcribeAudio(audioBuffer: Buffer): Promise<string> {
    try {
      // Create a temporary file for the audio
      const tempFile = new File([audioBuffer], 'temp_audio.mp3', { type: 'audio/mpeg' });
      
      const response = await openai.audio.transcriptions.create({
        file: tempFile,
        model: 'whisper-1',
        language: 'en', // You can make this configurable
        response_format: 'text'
      });

      return response || '';
    } catch (error) {
      console.warn(`Audio transcription failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return ''; // Return empty string if transcription fails
    }
  }

  async analyzeAudio(audioContext: any, metadataFields: MetadataField[]): Promise<GeneratedMetadata> {
    try {
      const fieldDescriptions = metadataFields
        .map(field => `- ${field.name}: ${field.description}`)
        .join('\n');

      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `You are an expert audio content analyst. Analyze the provided audio file information and generate comprehensive metadata.

${fieldDescriptions ? `Required Metadata Fields:\n${fieldDescriptions}\n` : 'Generate comprehensive metadata including description, keywords, category, mood, speakers, topics, language, and genre.\n'}

Analysis Guidelines:
- Use the transcript to understand the audio content and context
- Identify speakers, topics, themes, and key information
- Determine the audio category (music, podcast, speech, interview, etc.)
- Extract relevant keywords and topics from the content
- Assess the tone, mood, and style of the audio
- Be specific and accurate in your analysis

Return your response as JSON with the field names as keys.`
          },
          {
            role: "user",
            content: `Analyze this audio file:

File Information:
- Filename: ${audioContext.fileName}
- File Size: ${audioContext.fileSize}
- MIME Type: ${audioContext.mimeType}
- Duration: ${audioContext.duration}

${audioContext.transcript && audioContext.transcript !== 'Transcription not available' 
  ? `Transcript:\n${audioContext.transcript}` 
  : 'No transcript available - base analysis on filename and file properties.'}`
          }
        ],
        response_format: { type: "json_object" },
        max_tokens: 1000,
      });

      return JSON.parse(response.choices[0].message.content || '{}');
    } catch (error) {
      throw new Error(`Failed to analyze audio: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async analyzeDocumentContent(extractedText: string, metadataFields: MetadataField[], fileContext: any): Promise<GeneratedMetadata> {
    try {
      const fieldDescriptions = metadataFields
        .map(field => `- ${field.name}: ${field.description}`)
        .join('\n');

      // Truncate very long text to stay within token limits while preserving key content
      const maxLength = 12000;
      let processedText = extractedText;
      
      if (extractedText.length > maxLength) {
        // Take beginning and end of document to capture introduction and conclusion
        const beginningText = extractedText.substring(0, maxLength * 0.6);
        const endingText = extractedText.substring(extractedText.length - maxLength * 0.4);
        processedText = beginningText + '\n\n[... content truncated ...]\n\n' + endingText;
      }

      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `You are an expert document analyst with deep expertise in content analysis and metadata generation. Your task is to thoroughly analyze the provided document content and generate comprehensive, accurate metadata.

Required Metadata Fields:
${fieldDescriptions}

Analysis Guidelines:
- Read and understand the ENTIRE document content provided
- Extract specific information directly from the text, not assumptions
- Generate precise, content-based descriptions and summaries
- Identify actual topics, themes, and key concepts mentioned in the text
- Extract real keywords and terminology used in the document
- Determine the document's purpose, audience, and subject matter from content
- Identify any mentioned authors, organizations, or sources
- Note the document structure, main sections, and key findings
- Be specific and detailed - avoid generic descriptions
- Base ALL metadata on actual document content, not filename

Return your response as JSON with the field names as keys. Ensure each field provides meaningful, content-specific information.`
          },
          {
            role: "user",
            content: `Please analyze this document content and generate detailed metadata:

File Information:
- Filename: ${fileContext.filename}
- File Type: ${fileContext.fileType}
- File Size: ${fileContext.fileSize} bytes

Document Content:
${processedText}

Based on the actual content above, provide comprehensive and accurate metadata that reflects what the document actually contains, discusses, and covers.`
          }
        ],
        response_format: { type: "json_object" },
        max_tokens: 1000,
        temperature: 0.3, // Lower temperature for more consistent, factual analysis
      });

      const result = JSON.parse(response.choices[0].message.content || '{}');
      console.log('Generated content-based metadata:', Object.keys(result));
      return result;
    } catch (error) {
      throw new Error(`Failed to analyze document content: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async analyzeDocumentByContext(context: any, metadataFields: MetadataField[]): Promise<GeneratedMetadata> {
    try {
      const fieldDescriptions = metadataFields
        .map(field => `- ${field.name}: ${field.description}`)
        .join('\n');

      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `You are an expert document analyst. Analyze file information and generate comprehensive metadata based on filename, file properties, and context clues.

${fieldDescriptions ? `Required Metadata Fields:\n${fieldDescriptions}\n` : 'Generate comprehensive metadata including description, keywords, category, and subject.\n'}

Analysis Guidelines:
- Extract meaningful information from the filename and file properties
- Infer document type, subject matter, and likely content from naming conventions
- Generate relevant keywords based on filename components
- Determine appropriate categories and classifications
- Be specific and analytical in your assessment

Return your response as JSON with the field names as keys.`
          },
          {
            role: "user",
            content: `Analyze this document and generate metadata:

File Information:
- Filename: ${context.filename}
- File Size: ${context.fileSize} bytes
- MIME Type: ${context.mimeType}
- File Type: ${context.fileType}
- Created: ${context.createdTime}
- Modified: ${context.modifiedTime}

Based on the filename and file properties, provide intelligent metadata analysis.`
          }
        ],
        response_format: { type: "json_object" },
        max_tokens: 800,
      });

      return JSON.parse(response.choices[0].message.content || '{}');
    } catch (error) {
      throw new Error(`Failed to analyze document by context: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async generateDefaultMetadata(fileName: string, fileType: string, mimeType: string): Promise<GeneratedMetadata> {
    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `You are an expert file analyst. Generate basic metadata for a file based on its name, type, and MIME type. Return your response as JSON.

Generate metadata including:
- description: A brief description based on the filename
- keywords: An array of relevant keywords/tags
- category: A general category for the file
- mood: If applicable, describe the mood or tone`
          },
          {
            role: "user",
            content: `Generate metadata for this file:
Filename: ${fileName}
Type: ${fileType}
MIME Type: ${mimeType}`
          }
        ],
        response_format: { type: "json_object" },
        max_tokens: 500,
      });

      return JSON.parse(response.choices[0].message.content || '{}');
    } catch (error) {
      throw new Error(`Failed to generate default metadata: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  
}

export const openAIService = new OpenAIService();
