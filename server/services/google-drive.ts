import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';

const SCOPES = ['https://www.googleapis.com/auth/drive.readonly'];

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
    });
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
    } catch (error) {
      throw new Error(`Failed to list folders: ${error.message}`);
    }
  }

  async listFiles(folderId: string): Promise<DriveFileInfo[]> {
    try {
      const response = await this.drive.files.list({
        q: `'${folderId}' in parents and trashed=false`,
        fields: 'files(id, name, mimeType, size, parents, webViewLink, thumbnailLink, createdTime, modifiedTime)',
        pageSize: 100,
      });

      return response.data.files || [];
    } catch (error) {
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
    } catch (error) {
      throw new Error(`Failed to get file content: ${error.message}`);
    }
  }

  async getFileMetadata(fileId: string): Promise<any> {
    try {
      const response = await this.drive.files.get({
        fileId,
        fields: 'id, name, mimeType, size, parents, webViewLink, thumbnailLink, createdTime, modifiedTime, imageMediaMetadata, videoMediaMetadata, properties',
      });

      return response.data;
    } catch (error) {
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
    } catch (error) {
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
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType === 'application/pdf') return 'pdf';
    return 'other';
  }
}

export const googleDriveService = new GoogleDriveService();
