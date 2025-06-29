import { 
  users, 
  driveFiles, 
  metadataTemplates, 
  processingJobs,
  type User, 
  type InsertUser,
  type DriveFile,
  type InsertDriveFile,
  type MetadataTemplate,
  type InsertMetadataTemplate,
  type ProcessingJob,
  type InsertProcessingJob
} from "@shared/schema";

export interface IStorage {
  // User methods
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  // Drive file methods
  getDriveFile(id: number): Promise<DriveFile | undefined>;
  getDriveFileByDriveId(driveId: string): Promise<DriveFile | undefined>;
  getDriveFilesByFolder(folderId: string): Promise<DriveFile[]>;
  getAllDriveFiles(): Promise<DriveFile[]>;
  createDriveFile(file: InsertDriveFile): Promise<DriveFile>;
  updateDriveFile(id: number, updates: Partial<DriveFile>): Promise<DriveFile | undefined>;
  deleteDriveFile(id: number): Promise<boolean>;
  
  // Metadata template methods
  getMetadataTemplate(id: number): Promise<MetadataTemplate | undefined>;
  getAllMetadataTemplates(): Promise<MetadataTemplate[]>;
  createMetadataTemplate(template: InsertMetadataTemplate): Promise<MetadataTemplate>;
  updateMetadataTemplate(id: number, updates: Partial<MetadataTemplate>): Promise<MetadataTemplate | undefined>;
  deleteMetadataTemplate(id: number): Promise<boolean>;
  
  // Processing job methods
  getProcessingJob(id: number): Promise<ProcessingJob | undefined>;
  getAllProcessingJobs(): Promise<ProcessingJob[]>;
  createProcessingJob(job: InsertProcessingJob): Promise<ProcessingJob>;
  updateProcessingJob(id: number, updates: Partial<ProcessingJob>): Promise<ProcessingJob | undefined>;
  deleteProcessingJob(id: number): Promise<boolean>;
}

export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private driveFiles: Map<number, DriveFile>;
  private metadataTemplates: Map<number, MetadataTemplate>;
  private processingJobs: Map<number, ProcessingJob>;
  private currentUserId: number;
  private currentDriveFileId: number;
  private currentTemplateId: number;
  private currentJobId: number;

  constructor() {
    this.users = new Map();
    this.driveFiles = new Map();
    this.metadataTemplates = new Map();
    this.processingJobs = new Map();
    this.currentUserId = 1;
    this.currentDriveFileId = 1;
    this.currentTemplateId = 1;
    this.currentJobId = 1;
  }

  // User methods
  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(user => user.username === username);
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.currentUserId++;
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }

  // Drive file methods
  async getDriveFile(id: number): Promise<DriveFile | undefined> {
    return this.driveFiles.get(id);
  }

  async getDriveFileByDriveId(driveId: string): Promise<DriveFile | undefined> {
    return Array.from(this.driveFiles.values()).find(file => file.driveId === driveId);
  }

  async getDriveFilesByFolder(folderId: string): Promise<DriveFile[]> {
    return Array.from(this.driveFiles.values()).filter(file => file.parentFolderId === folderId);
  }

  async getAllDriveFiles(): Promise<DriveFile[]> {
    return Array.from(this.driveFiles.values());
  }

  async createDriveFile(insertFile: InsertDriveFile): Promise<DriveFile> {
    const id = this.currentDriveFileId++;
    const file: DriveFile = { 
      ...insertFile, 
      id,
      status: insertFile.status ?? 'pending',
      parentFolderId: insertFile.parentFolderId ?? null,
      webViewLink: insertFile.webViewLink ?? null,
      thumbnailLink: insertFile.thumbnailLink ?? null,
      processingError: insertFile.processingError ?? null,
      existingMetadata: insertFile.existingMetadata ?? null,
      aiGeneratedMetadata: insertFile.aiGeneratedMetadata ?? null,
      customMetadata: insertFile.customMetadata ?? null
    };
    this.driveFiles.set(id, file);
    return file;
  }

  async updateDriveFile(id: number, updates: Partial<DriveFile>): Promise<DriveFile | undefined> {
    const existing = this.driveFiles.get(id);
    if (!existing) return undefined;
    
    const updated = { ...existing, ...updates };
    this.driveFiles.set(id, updated);
    return updated;
  }

  async deleteDriveFile(id: number): Promise<boolean> {
    return this.driveFiles.delete(id);
  }

  // Metadata template methods
  async getMetadataTemplate(id: number): Promise<MetadataTemplate | undefined> {
    return this.metadataTemplates.get(id);
  }

  async getAllMetadataTemplates(): Promise<MetadataTemplate[]> {
    return Array.from(this.metadataTemplates.values());
  }

  async createMetadataTemplate(insertTemplate: InsertMetadataTemplate): Promise<MetadataTemplate> {
    const id = this.currentTemplateId++;
    const template: MetadataTemplate = { 
      ...insertTemplate, 
      id, 
      description: insertTemplate.description ?? null,
      createdAt: new Date() 
    };
    this.metadataTemplates.set(id, template);
    return template;
  }

  async updateMetadataTemplate(id: number, updates: Partial<MetadataTemplate>): Promise<MetadataTemplate | undefined> {
    const existing = this.metadataTemplates.get(id);
    if (!existing) return undefined;
    
    const updated = { ...existing, ...updates };
    this.metadataTemplates.set(id, updated);
    return updated;
  }

  async deleteMetadataTemplate(id: number): Promise<boolean> {
    return this.metadataTemplates.delete(id);
  }

  // Processing job methods
  async getProcessingJob(id: number): Promise<ProcessingJob | undefined> {
    return this.processingJobs.get(id);
  }

  async getAllProcessingJobs(): Promise<ProcessingJob[]> {
    return Array.from(this.processingJobs.values());
  }

  async createProcessingJob(insertJob: InsertProcessingJob): Promise<ProcessingJob> {
    const id = this.currentJobId++;
    const job: ProcessingJob = { 
      ...insertJob, 
      id,
      status: insertJob.status ?? 'pending',
      templateId: insertJob.templateId ?? null,
      processedFiles: insertJob.processedFiles ?? 0,
      failedFiles: insertJob.failedFiles ?? 0,
      errorMessage: insertJob.errorMessage ?? null,
      createdAt: new Date(),
      completedAt: null
    };
    this.processingJobs.set(id, job);
    return job;
  }

  async updateProcessingJob(id: number, updates: Partial<ProcessingJob>): Promise<ProcessingJob | undefined> {
    const existing = this.processingJobs.get(id);
    if (!existing) return undefined;
    
    const updated = { ...existing, ...updates };
    this.processingJobs.set(id, updated);
    return updated;
  }

  async deleteProcessingJob(id: number): Promise<boolean> {
    return this.processingJobs.delete(id);
  }
}

export const storage = new MemStorage();
