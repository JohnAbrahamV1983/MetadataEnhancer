import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';

const SCOPES = [
  'https://www.googleapis.com/auth/drive.metadata',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/userinfo.email'
];

interface DriveFileInfo {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  parents?: string[];
  webViewLink?: string;
  thumbnailLink?: string;
  createdTime: string;
  modifiedTime: string;
  properties?: Record<string, string>;
}

interface FolderInfo {
  id: string;
  name: string;
  path: string;
}

export class GoogleDriveService {
  private auth: OAuth2Client;
  private drive: any;

  constructor() {
    // Fix double slash in redirect URI by ensuring proper format
    let redirectUri = process.env.GOOGLE_REDIRECT_URI || '';
    if (redirectUri.includes('//api/')) {
      redirectUri = redirectUri.replace('//api/', '/api/');
    }

    this.auth = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      redirectUri
    );

    // Set credentials if refresh token is available
    if (process.env.GOOGLE_REFRESH_TOKEN) {
      this.auth.setCredentials({
        refresh_token: process.env.GOOGLE_REFRESH_TOKEN
      });
    }

    this.drive = google.drive({ version: 'v3', auth: this.auth });
  }

  getAuthUrl(): string {
    return this.auth.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
      prompt: 'select_account', // Force account selection every time
    });
  }

  isAuthenticated(): boolean {
    const credentials = this.auth.credentials;
    return !!(credentials && (credentials.access_token || credentials.refresh_token));
  }

  async getUserInfo(): Promise<{ name: string; email: string } | null> {
    if (!this.isAuthenticated()) {
      return null;
    }

    try {
      const oauth2 = google.oauth2({ version: 'v2', auth: this.auth });
      const response = await oauth2.userinfo.get();

      return {
        name: response.data.name || 'Unknown User',
        email: response.data.email || 'Unknown Email'
      };
    } catch (error: any) {
      console.error('Failed to get user info:', error?.message || error);
      // If it's an auth error, the tokens might be expired
      if (error?.code === 401 || error?.status === 401) {
        console.log('Authentication error - tokens may be expired');
        return null;
      }
      return null;
    }
  }

  disconnect(): void {
    this.auth.setCredentials({});
  }

  async setAuthToken(code: string): Promise<void> {
    const { tokens } = await this.auth.getToken(code);
    this.auth.setCredentials(tokens);
  }

  async listFolders(parentId?: string): Promise<FolderInfo[]> {
    try {
      const query = parentId 
        ? `mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`
        : `mimeType='application/vnd.google-apps.folder' and trashed=false`;

      const response = await this.drive.files.list({
        q: query,
        fields: 'files(id, name, parents)',
        pageSize: 100,
      });

      const folders: FolderInfo[] = [];
      for (const folder of response.data.files || []) {
        const path = await this.getFolderPath(folder.id);
        folders.push({
          id: folder.id,
          name: folder.name,
          path,
        });
      }

      return folders;
    } catch (error: any) {
      throw new Error(`Failed to list folders: ${error.message}`);
    }
  }

  async listFiles(folderId: string): Promise<DriveFileInfo[]> {
    try {
      const response = await this.drive.files.list({
        q: `'${folderId}' in parents and trashed=false`,
        fields: 'files(id, name, mimeType, size, parents, webViewLink, thumbnailLink, createdTime, modifiedTime, properties)',
        pageSize: 100,
      });

      return response.data.files || [];
    } catch (error: any) {
      throw new Error(`Failed to list files: ${error.message}`);
    }
  }

  async getFileContent(fileId: string): Promise<Buffer> {
    try {
      const response = await this.drive.files.get({
        fileId,
        alt: 'media',
      }, { responseType: 'stream' });

      const chunks: Buffer[] = [];
      return new Promise((resolve, reject) => {
        response.data.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.data.on('end', () => resolve(Buffer.concat(chunks)));
        response.data.on('error', reject);
      });
    } catch (error: any) {
      throw new Error(`Failed to get file content: ${error.message}`);
    }
  }

  async getFileMetadata(fileId: string): Promise<any> {
    try {
      const response = await this.drive.files.get({
        fileId,
        fields: 'id, name, mimeType, size, createdTime, modifiedTime, properties,videoMediaMetadata,imageMediaMetadata',
      });

      return response.data;
    } catch (error: any) {
      throw new Error(`Failed to get file metadata: ${error.message}`);
    }
  }

  async updateFileProperties(fileId: string, properties: Record<string, string>): Promise<void> {
    try {
      await this.drive.files.update({
        fileId,
        resource: {
          properties,
        },
      });
    } catch (error: any) {
      throw new Error(`Failed to update file properties: ${error.message}`);
    }
  }

  private async getFolderPath(folderId: string): Promise<string> {
    try {
      const parts: string[] = [];
      let currentId = folderId;

      while (currentId) {
        const response = await this.drive.files.get({
          fileId: currentId,
          fields: 'name, parents',
        });

        parts.unshift(response.data.name);
        currentId = response.data.parents?.[0];
      }

      return '/' + parts.join('/');
    } catch (error) {
      return '/Unknown';
    }
  }

  getFileType(mimeType: string): string {
    // Images
    if (mimeType.startsWith('image/')) return 'image';
    
    // Videos
    if (mimeType.startsWith('video/')) return 'video';
    
    // Audio files
    if (mimeType.startsWith('audio/')) return 'audio';
    
    // PDF files
    if (mimeType === 'application/pdf') return 'pdf';
    
    // Microsoft Office documents
    if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || 
        mimeType === 'application/msword') return 'document';
    
    // Microsoft Excel files
    if (mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || 
        mimeType === 'application/vnd.ms-excel') return 'spreadsheet';
    
    // Microsoft PowerPoint files
    if (mimeType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' || 
        mimeType === 'application/vnd.ms-powerpoint') return 'presentation';
    
    // Google Workspace files
    if (mimeType === 'application/vnd.google-apps.document') return 'document';
    if (mimeType === 'application/vnd.google-apps.spreadsheet') return 'spreadsheet';
    if (mimeType === 'application/vnd.google-apps.presentation') return 'presentation';
    
    // Text files
    if (mimeType.startsWith('text/')) return 'text';
    
    // Archive files
    if (mimeType === 'application/zip' || 
        mimeType === 'application/x-rar-compressed' || 
        mimeType === 'application/x-7z-compressed') return 'archive';
    
    return 'other';
  }

  async getAccessToken(): Promise<string> {
    try {
      const credentials = await this.auth.getAccessToken();
      if (!credentials.token) {
        throw new Error('No access token available');
      }
      return credentials.token;
    } catch (error: any) {
      throw new Error(`Failed to get access token: ${error.message}`);
    }
  }
}

export const googleDriveService = new GoogleDriveService();