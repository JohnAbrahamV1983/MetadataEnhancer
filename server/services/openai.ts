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
  private currentBalance: number = 9.68; // Default to your current balance
  private estimatedUsed: number = 0.00;
  private lastUpdated: Date = new Date();
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
          content: `You are an expert video analyst. Analyze the provided video metadata${thumbnailBase64 ? ' and thumbnail' : ''} to generate metadata based on the specified fields. Return your response as JSON with the field names as keys.

${fieldDescriptions ? `Metadata Fields:\n${fieldDescriptions}` : 'Generate appropriate metadata including description, keywords, category, and mood.'}

For each field, provide appropriate values based on the video information. For 'tags' type fields, return an array of relevant tags.`
        }
      ];

      if (thumbnailBase64) {
        messages.push({
          role: "user",
          content: [
            {
              type: "text",
              text: `Analyze this video based on its metadata and thumbnail:\n\nMetadata: ${JSON.stringify(metadata, null, 2)}`
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
          content: `Analyze this video based on its metadata:\n\n${JSON.stringify(metadata, null, 2)}`
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

  async getAccountBalance(): Promise<{ balance: number; currency: string; used: number; total: number; percentage: number; lastUpdated: string }> {
    try {
      // OpenAI doesn't provide a public API for credit balance
      // This uses a manual approach where users can set their current balance
      // and we track estimated usage from actual API calls
      
      const totalCredits = this.currentBalance + this.estimatedUsed;
      const percentage = totalCredits > 0 ? (this.currentBalance / totalCredits) * 100 : 100;

      return {
        balance: this.currentBalance,
        used: this.estimatedUsed,
        total: totalCredits,
        percentage: percentage,
        currency: 'USD',
        lastUpdated: this.lastUpdated.toISOString()
      };
    } catch (error) {
      throw new Error(`Failed to retrieve account balance: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async updateAccountBalance(newBalance: number): Promise<void> {
    this.currentBalance = newBalance;
    this.lastUpdated = new Date();
  }
}

export const openAIService = new OpenAIService();
