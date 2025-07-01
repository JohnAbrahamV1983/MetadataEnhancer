# replit.md

## Overview

This is a full-stack web application called "Metadata Enhancer" built for Google Drive file metadata processing and management. The application allows users to connect to their Google Drive, browse files, and automatically generate metadata using AI (OpenAI) with customizable templates. It features a modern React frontend with a Node.js/Express backend, PostgreSQL database integration, and comprehensive file processing capabilities.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite with React plugin
- **Routing**: Wouter for client-side routing
- **UI Library**: Radix UI primitives with shadcn/ui components
- **Styling**: Tailwind CSS with CSS variables for theming
- **State Management**: TanStack Query (React Query) for server state
- **Form Handling**: React Hook Form with Zod validation

### Backend Architecture
- **Runtime**: Node.js with TypeScript
- **Framework**: Express.js with middleware for JSON parsing and logging
- **Database ORM**: Drizzle ORM with PostgreSQL dialect
- **File Processing**: Multer for file uploads, CSV parser, XLSX for Excel files
- **Authentication**: Google OAuth2 for Drive access
- **AI Integration**: OpenAI API for metadata generation

### Database Schema
- **Users**: Basic user management with username/password
- **Drive Files**: Comprehensive file metadata storage including AI-generated metadata
- **Metadata Templates**: Customizable field definitions for metadata generation
- **Processing Jobs**: Batch processing tracking with status and progress

## Key Components

### File Management System
- Google Drive integration for browsing folders and files
- File type detection (image, video, PDF, other)
- Thumbnail and preview support
- File status tracking (pending, processing, processed, error)

### AI Metadata Generation
- OpenAI GPT-4o integration for intelligent metadata extraction
- Image analysis capabilities for visual content
- PDF text extraction and analysis
- Customizable metadata templates with field types (text, select, tags)

### Processing Pipeline
- Individual file processing with error handling
- Batch processing for entire folders
- Real-time progress tracking
- Job queue management with status updates

### User Interface
- Dashboard with sidebar navigation
- File grid with list/grid view modes
- Metadata panel for viewing and editing file metadata
- Processing modal with progress indicators
- Smart search interface for finding images by AI-generated metadata
- Responsive design with mobile support

## Data Flow

1. **Authentication**: User authenticates with Google Drive OAuth2
2. **File Discovery**: Browse Drive folders and sync file metadata to local database
3. **Template Selection**: Choose or create metadata templates for processing
4. **Processing**: AI analyzes files and generates metadata based on templates
5. **Review & Edit**: Users can review and modify generated metadata
6. **Export**: Processed metadata can be exported or used for further analysis

## External Dependencies

### Core Services
- **Google Drive API**: File access and browsing
- **OpenAI API**: AI-powered metadata generation
- **Neon Database**: PostgreSQL hosting (configured for serverless)

### Key Libraries
- **Authentication**: google-auth-library, googleapis
- **Database**: drizzle-orm, @neondatabase/serverless
- **File Processing**: multer, csv-parser, xlsx, pdf-parse
- **UI Components**: @radix-ui/* packages, class-variance-authority
- **Development**: tsx for TypeScript execution, esbuild for production builds

## Deployment Strategy

### Development Environment
- **Server**: tsx for hot-reloading TypeScript execution
- **Client**: Vite dev server with HMR
- **Database**: Drizzle Kit for schema management and migrations

### Production Build
- **Client**: Vite build to static assets in dist/public
- **Server**: esbuild bundle to ESM format in dist/
- **Database**: Push schema changes via drizzle-kit push

### Environment Variables Required
- `DATABASE_URL`: PostgreSQL connection string
- `GOOGLE_CLIENT_ID`: Google OAuth client ID
- `GOOGLE_CLIENT_SECRET`: Google OAuth client secret
- `GOOGLE_REDIRECT_URI`: OAuth redirect URI
- `GOOGLE_REFRESH_TOKEN`: Long-lived refresh token
- `OPENAI_API_KEY`: OpenAI API key for metadata generation

## Changelog

```
Changelog:
- June 28, 2025. Initial setup
- June 28, 2025. Enhanced folder picker with Windows-like browser interface
- June 28, 2025. Renamed application from "Drive Metadata Manager" to "Metadata Enhancer"
- June 28, 2025. Added AI Search feature with recursive folder search and navigation
- June 28, 2025. Fixed AI metadata persistence - now restores metadata from Google Drive properties on reload
- June 29, 2025. Added analytics to AI Search - shows percentage and absolute numbers of AI-tagged assets and filled fields per folder
- June 30, 2025. Added Agentic Search feature - natural language AI-powered file search with intelligent query understanding and semantic matching
- June 30, 2025. Enhanced Agentic Search with recursive folder searching, improved UI matching AI Search design, and collapsible metadata display
- June 30, 2025. Extended Agentic Search to include unprocessed files - now finds all files based on names, types, and dates even without AI metadata
- June 30, 2025. Fixed critical AI metadata persistence issue - properly restores AI metadata from Google Drive properties in all file discovery operations, ensuring search works on historically processed files
- July 1, 2025. Implemented comprehensive document content scanning for PDFs, PowerPoint presentations, Word documents, Excel spreadsheets, and text files with actual text extraction for meaningful AI metadata generation
```

## User Preferences

```
Preferred communication style: Simple, everyday language.
```