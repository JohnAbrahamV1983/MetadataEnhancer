import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Cloud, Settings, UserCircle, FolderOpen, Upload, Play, Edit } from "lucide-react";

interface HeaderProps {
  currentFolderId: string;
  onFolderChange: (folderId: string) => void;
  onStartProcessing: () => void;
}

export default function Header({ currentFolderId, onFolderChange, onStartProcessing }: HeaderProps) {
  const [showFolderDialog, setShowFolderDialog] = useState(false);
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);
  const { toast } = useToast();

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
      setShowTemplateDialog(false);
    },
    onError: (error: any) => {
      toast({
        title: "Upload failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleTemplateUpload = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    uploadTemplateMutation.mutate(formData);
  };

  return (
    <header className="bg-card shadow-sm border-b border-border sticky top-0 z-50">
      <div className="px-6 py-4 flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <Cloud className="text-primary text-xl" />
            <h1 className="text-xl font-semibold text-foreground">Drive Metadata Manager</h1>
          </div>
        </div>
        
        <div className="flex items-center space-x-4">
          {isConnected ? (
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
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Select Folder</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <Label>Choose a folder to process:</Label>
                    <Select onValueChange={(value) => {
                      onFolderChange(value);
                      setShowFolderDialog(false);
                    }}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a folder" />
                      </SelectTrigger>
                      <SelectContent>
                        {folders?.map((folder) => (
                          <SelectItem key={folder.id} value={folder.id}>
                            {folder.path}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
            
            <div className="flex items-center space-x-3">
              <Dialog open={showTemplateDialog} onOpenChange={setShowTemplateDialog}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Upload className="h-4 w-4 mr-2" />
                    Upload CSV Template
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Upload Metadata Template</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleTemplateUpload} className="space-y-4">
                    <div>
                      <Label htmlFor="name">Template Name</Label>
                      <Input id="name" name="name" placeholder="Enter template name" required />
                    </div>
                    <div>
                      <Label htmlFor="description">Description</Label>
                      <Input id="description" name="description" placeholder="Enter description" />
                    </div>
                    <div>
                      <Label htmlFor="file">CSV/Excel File</Label>
                      <Input id="file" name="file" type="file" accept=".csv,.xlsx" required />
                    </div>
                    <Button type="submit" disabled={uploadTemplateMutation.isPending}>
                      {uploadTemplateMutation.isPending ? "Uploading..." : "Upload Template"}
                    </Button>
                  </form>
                </DialogContent>
              </Dialog>
              
              <Button 
                onClick={onStartProcessing}
                disabled={!currentFolderId}
                size="sm"
              >
                <Play className="h-4 w-4 mr-2" />
                Start Processing
              </Button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
