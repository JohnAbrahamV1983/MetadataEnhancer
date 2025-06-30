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

  async analyzeVideo(metadata: any, thumbnailBase64?: string, metadataFields?: MetadataField[]): Promise<GeneratedMetadata> {
    try {
      const fieldDescriptions = metadataFields?.map(field => 
        `${field.name}: ${field.description} (${field.type}${field.options ? `, options: ${field.options.join(', ')}` : ''})`
      ).join('\n') || '';

      let messages: any[] = [
        {
          role: "system",
          content: `You are an expert video content analyst. Your task is to analyze video files and generate meaningful metadata based on available information.

${fieldDescriptions ? `Required Metadata Fields:\n${fieldDescriptions}\n` : 'Generate comprehensive metadata including description, keywords, category, and mood.\n'}

Analysis Guidelines:
- If a thumbnail is provided, analyze the visual content thoroughly
- Use filename patterns to infer content type (e.g., "meeting", "presentation", "tutorial", "demo")
- Consider video duration to determine content type (short clips vs. long content)
- For technical metadata like resolution/duration, incorporate this into your analysis
- Generate specific, descriptive keywords rather than generic ones
- Be specific about what you can observe rather than making broad assumptions

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

      if (thumbnailBase64) {
        messages.push({
          role: "user",
          content: [
            {
              type: "text",
              text: `Analyze this video file. Pay special attention to the thumbnail image which shows a frame from the video content.

Video Information:
- Filename: ${videoInfo.filename}
- Duration: ${videoInfo.duration}
- Resolution: ${videoInfo.dimensions}
- File Size: ${videoInfo.fileSize}
- Created: ${videoInfo.createdTime}
- Type: ${videoInfo.mimeType}

Based on the thumbnail and video information, provide detailed and specific metadata. Focus on what you can actually see in the thumbnail rather than generic assumptions.`
            },
            {
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${thumbnailBase64}`
              }
            }
          ],
        });
      } else {
        messages.push({
          role: "user",
          content: `Analyze this video file based on the available metadata and filename patterns:

Video Information:
- Filename: ${videoInfo.filename}
- Duration: ${videoInfo.duration}
- Resolution: ${videoInfo.dimensions}
- File Size: ${videoInfo.fileSize}
- Created: ${videoInfo.createdTime}
- Type: ${videoInfo.mimeType}

Technical Metadata: ${JSON.stringify(metadata, null, 2)}

Note: No thumbnail is available. Base your analysis on the filename, technical properties, and any patterns you can identify. Be specific about what you can infer from the available information.`
        });
      }

      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages,
        response_format: { type: "json_object" },
        max_tokens: 1000,
      });

      return JSON.parse(response.choices[0].message.content || '{}');
    } catch (error) {
      throw new Error(`Failed to analyze video: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
