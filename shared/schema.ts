import { pgTable, text, serial, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const driveFiles = pgTable("drive_files", {
  id: serial("id").primaryKey(),
  driveId: text("drive_id").notNull().unique(),
  name: text("name").notNull(),
  type: text("type").notNull(), // 'image', 'video', 'pdf', 'other'
  size: integer("size").notNull(),
  mimeType: text("mime_type").notNull(),
  parentFolderId: text("parent_folder_id"),
  webViewLink: text("web_view_link"),
  thumbnailLink: text("thumbnail_link"),
  createdTime: timestamp("created_time").notNull(),
  modifiedTime: timestamp("modified_time").notNull(),
  status: text("status").notNull().default("pending"), // 'pending', 'processing', 'processed', 'error'
  processingError: text("processing_error"),
  existingMetadata: jsonb("existing_metadata"),
  aiGeneratedMetadata: jsonb("ai_generated_metadata"),
  customMetadata: jsonb("custom_metadata"),
});

export const metadataTemplates = pgTable("metadata_templates", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  fields: jsonb("fields").notNull(), // Array of field definitions
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const processingJobs = pgTable("processing_jobs", {
  id: serial("id").primaryKey(),
  folderId: text("folder_id").notNull(),
  templateId: integer("template_id").references(() => metadataTemplates.id),
  status: text("status").notNull().default("pending"), // 'pending', 'running', 'completed', 'failed'
  totalFiles: integer("total_files").notNull(),
  processedFiles: integer("processed_files").notNull().default(0),
  failedFiles: integer("failed_files").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
  errorMessage: text("error_message"),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export const insertDriveFileSchema = createInsertSchema(driveFiles).omit({
  id: true,
});

export const insertMetadataTemplateSchema = createInsertSchema(metadataTemplates).omit({
  id: true,
  createdAt: true,
});

export const insertProcessingJobSchema = createInsertSchema(processingJobs).omit({
  id: true,
  createdAt: true,
  completedAt: true,
});

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

export type DriveFile = typeof driveFiles.$inferSelect;
export type InsertDriveFile = z.infer<typeof insertDriveFileSchema>;

export type MetadataTemplate = typeof metadataTemplates.$inferSelect;
export type InsertMetadataTemplate = z.infer<typeof insertMetadataTemplateSchema>;

export type ProcessingJob = typeof processingJobs.$inferSelect;
export type InsertProcessingJob = z.infer<typeof insertProcessingJobSchema>;
