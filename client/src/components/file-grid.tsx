import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { type DriveFile } from "@shared/schema";
import {
  Grid3X3,
  List,
  FileImage,
  FileVideo,
  FileText,
  File,
  MoreVertical,
  CheckCircle,
  Clock,
  PauseCircle,
  AlertCircle,
  RefreshCw,
  Folder
} from "lucide-react";

interface FileGridProps {
  files: DriveFile[];
  onFileSelect: (file: DriveFile) => void;
  selectedFileId?: number;
  currentFolderId: string;
  onRefresh: () => void;
}

export default function FileGrid({ 
  files, 
  onFileSelect, 
  selectedFileId, 
  currentFolderId,
  onRefresh 
}: FileGridProps) {
  const [viewMode, setViewMode] = useState<"grid" | "list">("list");
  const [filter, setFilter] = useState("all");
  const { toast } = useToast();

  const processFileMutation = useMutation({
    mutationFn: async (fileId: number) => {
      const response = await apiRequest("POST", `/api/process/file/${fileId}`, {});
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Processing started",
        description: "File processing has been initiated.",
      });
      queryClient.invalidateQueries({ queryKey: [`/api/drive/files/${currentFolderId}`, currentFolderId] });
    },
    onError: (error: any) => {
      toast({
        title: "Processing failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const getFileIcon = (file: DriveFile, isGridView = false) => {
    // Show thumbnail for images if available (only in list view, grid view handles this separately)
    if (file.type === 'image' && file.thumbnailLink && !isGridView) {
      return (
        <img 
          src={file.thumbnailLink} 
          alt={file.name}
          className="h-8 w-8 object-cover rounded"
        />
      );
    }
    
    // Fallback to type-based icons
    const iconSize = isGridView ? "h-16 w-16" : "h-5 w-5";
    switch (file.type) {
      case 'image':
        return <FileImage className={`${iconSize} text-blue-600`} />;
      case 'video':
        return <FileVideo className={`${iconSize} text-purple-600`} />;
      case 'pdf':
        return <FileText className={`${iconSize} text-red-600`} />;
      default:
        return <File className={`${iconSize} text-gray-600`} />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'processed':
        return <Badge variant="secondary" className="bg-accent/20 text-accent"><CheckCircle className="h-3 w-3 mr-1" />Processed</Badge>;
      case 'processing':
        return <Badge variant="secondary" className="bg-yellow-100 text-yellow-800"><Clock className="h-3 w-3 mr-1" />Processing</Badge>;
      case 'error':
        return <Badge variant="destructive"><AlertCircle className="h-3 w-3 mr-1" />Error</Badge>;
      default:
        return <Badge variant="outline"><PauseCircle className="h-3 w-3 mr-1" />Pending</Badge>;
    }
  };

  const getTypeBadge = (type: string) => {
    const colors = {
      image: "bg-blue-100 text-blue-800",
      video: "bg-purple-100 text-purple-800",
      pdf: "bg-red-100 text-red-800",
      other: "bg-gray-100 text-gray-800"
    };
    
    return (
      <Badge variant="secondary" className={colors[type as keyof typeof colors] || colors.other}>
        {type.charAt(0).toUpperCase() + type.slice(1)}
      </Badge>
    );
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    if (diffHours < 1) return 'Modified just now';
    if (diffHours < 24) return `Modified ${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `Modified ${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    return `Modified ${date.toLocaleDateString()}`;
  };

  const filteredFiles = files.filter(file => {
    if (filter === "all") return true;
    if (filter === "images") return file.type === "image";
    if (filter === "videos") return file.type === "video";
    if (filter === "pdfs") return file.type === "pdf";
    if (filter === "processed") return file.status === "processed";
    if (filter === "unprocessed") return file.status === "pending";
    return true;
  });

  const stats = {
    total: files.length,
    processed: files.filter(f => f.status === "processed").length,
    processing: files.filter(f => f.status === "processing").length,
    pending: files.filter(f => f.status === "pending").length,
  };

  if (!currentFolderId) {
    return (
      <main className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <Folder className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-medium text-foreground mb-2">No Folder Selected</h3>
          <p className="text-muted-foreground">Please select a Google Drive folder to view files.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 flex flex-col overflow-hidden">
      <div className="bg-card border-b border-border px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <h2 className="text-lg font-semibold text-foreground">Files</h2>
            <span className="text-sm text-muted-foreground">{files.length} files</span>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={onRefresh}
              className="h-8 w-8 p-0"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex items-center space-x-3">
            <div className="flex items-center space-x-1 bg-muted rounded-lg p-1">
              <Button
                variant={viewMode === "grid" ? "default" : "ghost"}
                size="sm"
                onClick={() => setViewMode("grid")}
                className="h-8 w-8 p-0"
              >
                <Grid3X3 className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === "list" ? "default" : "ghost"}
                size="sm"
                onClick={() => setViewMode("list")}
                className="h-8 w-8 p-0"
              >
                <List className="h-4 w-4" />
              </Button>
            </div>
            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Files</SelectItem>
                <SelectItem value="images">Images</SelectItem>
                <SelectItem value="videos">Videos</SelectItem>
                <SelectItem value="pdfs">PDFs</SelectItem>
                <SelectItem value="processed">Processed</SelectItem>
                <SelectItem value="unprocessed">Unprocessed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {filteredFiles.length === 0 ? (
          <div className="text-center py-12">
            <File className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-2">No Files Found</h3>
            <p className="text-muted-foreground">
              {filter === "all" 
                ? "This folder doesn't contain any files." 
                : `No ${filter} found in this folder.`}
            </p>
          </div>
        ) : viewMode === "list" ? (
          <>
            <Card className="mb-6">
              <CardContent className="pt-6">
                <div className="grid grid-cols-12 gap-4 text-sm font-medium text-muted-foreground">
                  <div className="col-span-5">File Name</div>
                  <div className="col-span-2">Type</div>
                  <div className="col-span-2">Size</div>
                  <div className="col-span-2">Status</div>
                  <div className="col-span-1">Actions</div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-0">
                {filteredFiles.map((file) => (
                  <div 
                    key={file.id} 
                    className={`px-6 py-4 border-b border-border last:border-b-0 hover:bg-muted/50 transition-colors cursor-pointer ${
                      selectedFileId === file.id ? "bg-muted" : ""
                    }`}
                    onClick={() => onFileSelect(file)}
                  >
                    <div className="grid grid-cols-12 gap-4 items-center">
                      <div className="col-span-5 flex items-center space-x-3">
                        <div className="w-10 h-10 bg-muted rounded-lg flex items-center justify-center">
                          {getFileIcon(file, false)}
                        </div>
                        <div>
                          <p className="font-medium text-foreground">{file.name}</p>
                          <p className="text-sm text-muted-foreground">
                            {formatDate(file.modifiedTime.toString())}
                          </p>
                        </div>
                      </div>
                      <div className="col-span-2">
                        {getTypeBadge(file.type)}
                      </div>
                      <div className="col-span-2 text-sm text-muted-foreground">
                        {formatFileSize(file.size)}
                      </div>
                      <div className="col-span-2">
                        {getStatusBadge(file.status)}
                      </div>
                      <div className="col-span-1">
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (file.status === "pending") {
                              processFileMutation.mutate(file.id);
                            }
                          }}
                          disabled={file.status === "processing" || processFileMutation.isPending}
                          className="h-8 w-8 p-0"
                        >
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </>
        ) : (
          /* Grid View */
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {filteredFiles.map((file) => (
              <Card 
                key={file.id}
                className={`cursor-pointer hover:shadow-md transition-shadow ${
                  selectedFileId === file.id ? "ring-2 ring-primary" : ""
                }`}
                onClick={() => onFileSelect(file)}
              >
                <CardContent className="p-4">
                  <div className="aspect-square mb-3 bg-muted rounded-lg flex items-center justify-center overflow-hidden">
                    {file.type === 'image' && file.thumbnailLink ? (
                      <img 
                        src={file.thumbnailLink} 
                        alt={file.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-16 h-16">
                        {getFileIcon(file, true)}
                      </div>
                    )}
                  </div>
                  <div className="space-y-2">
                    <p className="font-medium text-sm text-foreground truncate" title={file.name}>
                      {file.name}
                    </p>
                    <div className="flex justify-between items-center">
                      {getTypeBadge(file.type)}
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (file.status === "pending") {
                            processFileMutation.mutate(file.id);
                          }
                        }}
                        disabled={file.status === "processing" || processFileMutation.isPending}
                        className="h-6 w-6 p-0"
                      >
                        <MoreVertical className="h-3 w-3" />
                      </Button>
                    </div>
                    <div className="flex justify-between items-center text-xs text-muted-foreground">
                      <span>{formatFileSize(file.size)}</span>
                      {getStatusBadge(file.status)}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Stats Cards */}
        <div className="mt-6 grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-muted-foreground">Total Files</span>
                <File className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="text-2xl font-semibold text-foreground">{stats.total}</div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-muted-foreground">Processed</span>
                <CheckCircle className="h-4 w-4 text-accent" />
              </div>
              <div className="text-2xl font-semibold text-accent">{stats.processed}</div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-muted-foreground">Processing</span>
                <Clock className="h-4 w-4 text-yellow-600" />
              </div>
              <div className="text-2xl font-semibold text-yellow-600">{stats.processing}</div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-muted-foreground">Pending</span>
                <PauseCircle className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="text-2xl font-semibold text-muted-foreground">{stats.pending}</div>
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}
