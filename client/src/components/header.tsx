import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Cloud, Settings, UserCircle, FolderOpen, Upload, Play, Edit, LogOut, Download, CloudUpload, Trash2 } from "lucide-react";
import FolderBrowser from "./folder-browser";

interface HeaderProps {
  currentFolderId: string;
  onFolderChange: (folderId: string) => void;
  onStartProcessing: () => void;
}

export default function Header({ currentFolderId, onFolderChange, onStartProcessing }: HeaderProps) {
  const [showFolderDialog, setShowFolderDialog] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Check authentication status
  const { data: authStatus, refetch: refetchAuthStatus } = useQuery({
    queryKey: ["/api/auth/status"],
    refetchInterval: 2000, // Check every 2 seconds
    staleTime: 0, // Always consider stale
    gcTime: 0, // Don't cache (TanStack Query v5 syntax)
  });

  const isConnected = authStatus?.isAuthenticated || false;

  const { data: folders } = useQuery({
    queryKey: ["/api/drive/folders"],
    enabled: isConnected,
  });

  const { data: userInfo } = useQuery({
    queryKey: ["/api/auth/user"],
    enabled: isConnected,
  });

  const { data: templates } = useQuery({
    queryKey: ["/api/templates"],
  });

  // Listen for OAuth callback messages
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data.type === 'GOOGLE_AUTH_SUCCESS') {
        refetchAuthStatus();
        queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
        queryClient.invalidateQueries({ queryKey: ["/api/drive/folders"] });
        toast({
          title: "Connected to Google Drive",
          description: "You can now browse and process your files.",
        });
      } else if (event.data.type === 'GOOGLE_AUTH_ERROR') {
        toast({
          title: "Connection failed",
          description: event.data.error || "Failed to connect to Google Drive",
          variant: "destructive",
        });
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [refetchAuthStatus, toast]);

  const connectMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("GET", "/api/auth/google/url");
      const { authUrl } = await response.json();

      // Open auth URL in new window
      const popup = window.open(authUrl, "_blank", "width=500,height=600");

      // Monitor popup for closure
      const checkClosed = setInterval(() => {
        if (popup?.closed) {
          clearInterval(checkClosed);
          // Give a moment for the message to arrive
          setTimeout(() => refetchAuthStatus(), 500);
        }
      }, 1000);

      return { success: true };
    },
    onError: (error: any) => {
      toast({
        title: "Connection failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const uploadTemplateMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const response = await fetch("/api/templates/upload", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message);
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Template uploaded",
        description: "Metadata template has been created successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/templates"] });
    },
    onError: (error: any) => {
      toast({
        title: "Upload failed",
        description: error.message + ". CSV format: fieldName,fieldDescription,fieldType,options. Excel columns: name,description,type,options",
        variant: "destructive",
      });
    },
  });

  const clearTemplatesMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("DELETE", "/api/templates/clear");
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Templates cleared",
        description: "All uploaded templates have been cleared successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/templates"] });
    },
    onError: (error: any) => {
      toast({
        title: "Clear failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/auth/disconnect");
      return response.json();
    },
    onSuccess: () => {
      refetchAuthStatus();
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      queryClient.invalidateQueries({ queryKey: ["/api/drive/folders"] });
      toast({
        title: "Disconnected",
        description: "You have been disconnected from Google Drive.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Disconnect failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const bulkExportMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/export/folder/${currentFolderId}`);
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Bulk export completed",
        description: `Exported metadata for ${data.exportedCount} files to Google Drive. You can now view the metadata in Google Drive's file properties.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Export failed",
        description: error.message || "An error occurred during bulk export",
        variant: "destructive",
      });
    },
  });

  const downloadSampleTemplate = () => {
    const sampleCSV = `Title,Description of image content,text,
Subject,Main subject or focus of the image,text,
Location,Where the image was taken,text,
Tags,Relevant keywords,tags,tag1;tag2;tag3
Quality,Image quality assessment,select,Excellent;Good;Fair;Poor
Category,Type of content,select,Portrait;Landscape;Product;Event;Other`;

    const blob = new Blob([sampleCSV], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = 'metadata-template-sample.csv';
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Generate template name from file name
    const fileName = file.name.replace(/\.(csv|xlsx)$/i, '');
    const templateName = fileName.replace(/[_-]/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

    const formData = new FormData();
    formData.append('name', templateName);
    formData.append('description', `Template imported from ${file.name}`);
    formData.append('file', file);

    uploadTemplateMutation.mutate(formData);

    // Reset the input
    event.target.value = '';
  };

  return (
    <header className="bg-card shadow-sm border-b border-border sticky top-0 z-50">
      <div className="px-6 py-4 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Cloud className="text-primary text-xl" />
          <h1 className="text-xl font-semibold text-foreground">Metadata Enhancer</h1>
        </div>

        <div className="flex items-center space-x-4">
          {isConnected ? (
            <div className="flex items-center space-x-2">
              <div className="flex items-center space-x-2 px-3 py-1 bg-accent/10 rounded-full">
                <div className="w-2 h-2 bg-accent rounded-full"></div>
                <div className="flex flex-col">
                  <span className="text-sm text-accent font-medium">Connected to Google Drive</span>
                  {userInfo && (
                    <span className="text-xs text-muted-foreground">
                      {userInfo.name} ({userInfo.email})
                    </span>
                  )}
                </div>
              </div>
              <Button 
                onClick={() => disconnectMutation.mutate()}
                disabled={disconnectMutation.isPending}
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-destructive"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <Button 
              onClick={() => connectMutation.mutate()}
              disabled={connectMutation.isPending}
              variant="outline"
              size="sm"
            >
              {connectMutation.isPending ? "Connecting..." : "Connect to Google Drive"}
            </Button>
          )}

          <Button variant="ghost" size="icon">
            <Settings className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon">
            <UserCircle className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {isConnected && (
        <div className="bg-card border-b border-border px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <FolderOpen className="text-primary h-4 w-4" />
                <span className="text-sm text-muted-foreground">Current Folder:</span>
                <span className="font-medium text-foreground">
                  {currentFolderId ? folders?.find(f => f.id === currentFolderId)?.path || "Unknown" : "No folder selected"}
                </span>
              </div>

              <Dialog open={showFolderDialog} onOpenChange={setShowFolderDialog}>
                <DialogTrigger asChild>
                  <Button variant="link" size="sm" className="text-primary hover:text-primary/80 h-auto p-0">
                    <Edit className="h-3 w-3 mr-1" />
                    Change Folder
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle>Select Folder</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <FolderBrowser
                      selectedFolderId={currentFolderId}
                      onFolderSelect={(folderId) => {
                        onFolderChange(folderId);
                        setShowFolderDialog(false);
                      }}
                    />
                  </div>
                </DialogContent>
              </Dialog>
            </div>

            <div className="flex items-center space-x-3">
              <input
                type="file"
                accept=".csv,.xlsx"
                onChange={handleFileUpload}
                style={{ display: 'none' }}
                id="csv-file-input"
              />
              <Button 
                variant="outline" 
                size="sm"
                onClick={downloadSampleTemplate}
              >
                <Download className="h-4 w-4 mr-2" />
                Download Sample
              </Button>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => document.getElementById('csv-file-input')?.click()}
                disabled={uploadTemplateMutation.isPending}
              >
                <Upload className="h-4 w-4 mr-2" />
                {uploadTemplateMutation.isPending ? "Uploading..." : "Upload CSV Template"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => clearTemplatesMutation.mutate()}
                disabled={clearTemplatesMutation.isPending}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                {clearTemplatesMutation.isPending ? "Clearing..." : "Clear Templates"}
              </Button>

              <Button 
                onClick={onStartProcessing}
                disabled={!currentFolderId}
                size="sm"
              >
                <Play className="h-4 w-4 mr-2" />
                Start Processing
              </Button>

              <Button 
                variant="outline"
                onClick={() => bulkExportMutation.mutate()}
                disabled={!currentFolderId || bulkExportMutation.isPending}
                size="sm"
              >
                <CloudUpload className="h-4 w-4 mr-2" />
                {bulkExportMutation.isPending ? "Exporting..." : "Export All to Drive"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}