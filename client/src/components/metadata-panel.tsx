import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { type DriveFile } from "@shared/schema";
import { RefreshCw, Monitor, Upload, CheckCircle } from "lucide-react";

interface MetadataPanelProps {
  file: DriveFile | null;
  onFileUpdate: (file: DriveFile) => void;
}

export default function MetadataPanel({ file, onFileUpdate }: MetadataPanelProps) {
  const { toast } = useToast();



  const regenerateMetadataMutation = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("No file selected");
      
      const response = await apiRequest("POST", `/api/process/file/${file.id}`, {});
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Regeneration started",
        description: "AI metadata regeneration has been initiated.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Regeneration failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const exportMetadataMutation = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("No file selected");
      
      const response = await apiRequest("POST", `/api/export/file/${file.id}`);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Metadata exported",
        description: "AI-generated metadata has been saved to Google Drive. You can now view it in Google Drive's file properties.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Export failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  if (!file) {
    return (
      <aside className="w-80 bg-card shadow-sm border-l border-border flex flex-col">
        <div className="px-6 py-4 border-b border-border">
          <h3 className="text-lg font-semibold text-foreground">File Details</h3>
        </div>
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="text-center">
            <div className="w-16 h-16 bg-muted rounded-lg flex items-center justify-center mx-auto mb-4">
              <Monitor className="h-8 w-8 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground">Select a file to view details</p>
          </div>
        </div>
      </aside>
    );
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const renderKeywords = (keywords: string[] | string) => {
    const keywordArray = Array.isArray(keywords) ? keywords : [keywords];
    return (
      <div className="flex flex-wrap gap-2">
        {keywordArray.map((keyword, index) => (
          <Badge key={index} variant="secondary" className="bg-primary/10 text-primary">
            {keyword}
          </Badge>
        ))}
      </div>
    );
  };

  return (
    <aside className="w-80 bg-card shadow-sm border-l border-border flex flex-col">
      <div className="px-6 py-4 border-b border-border">
        <h3 className="text-lg font-semibold text-foreground">File Details</h3>
      </div>
      
      <ScrollArea className="flex-1">
        <div className="p-6 space-y-6">
          {/* File Preview */}
          <Card>
            <CardContent className="p-4">
              {file.thumbnailLink ? (
                <img 
                  src={file.thumbnailLink} 
                  alt={file.name}
                  className="w-full h-32 object-cover rounded-lg border border-border"
                />
              ) : (
                <div className="w-full h-32 bg-muted rounded-lg border border-border flex items-center justify-center">
                  <span className="text-muted-foreground text-sm">No preview available</span>
                </div>
              )}
              <div className="mt-3">
                <h4 className="font-medium text-foreground">{file.name}</h4>
                <p className="text-sm text-muted-foreground">{file.parentFolderId}</p>
              </div>
            </CardContent>
          </Card>

          {/* Existing Metadata */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Existing Metadata</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between items-start">
                <span className="text-sm text-muted-foreground">Created</span>
                <span className="text-sm text-foreground">{formatDate(file.createdTime.toString())}</span>
              </div>
              <div className="flex justify-between items-start">
                <span className="text-sm text-muted-foreground">Modified</span>
                <span className="text-sm text-foreground">{formatDate(file.modifiedTime.toString())}</span>
              </div>
              <div className="flex justify-between items-start">
                <span className="text-sm text-muted-foreground">Size</span>
                <span className="text-sm text-foreground">
                  {(file.size / (1024 * 1024)).toFixed(2)} MB
                </span>
              </div>
              <div className="flex justify-between items-start">
                <span className="text-sm text-muted-foreground">Type</span>
                <span className="text-sm text-foreground">{file.mimeType}</span>
              </div>
            </CardContent>
          </Card>

          {/* AI-Generated Metadata */}
          {file.aiGeneratedMetadata && Object.keys(file.aiGeneratedMetadata).length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">AI-Generated Metadata</CardTitle>
                  <Badge variant="secondary" className="bg-accent/20 text-accent">Generated</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {Object.entries(file.aiGeneratedMetadata).map(([key, value]) => {
                  if (!value) return null;
                  
                  // Handle different field types
                  const fieldName = key.charAt(0).toUpperCase() + key.slice(1);
                  
                  if (Array.isArray(value) || (typeof value === 'string' && value.includes(';'))) {
                    // Handle tags/keywords fields
                    const items = Array.isArray(value) ? value : value.split(';').map(s => s.trim()).filter(Boolean);
                    return (
                      <div key={key}>
                        <Label className="text-sm text-muted-foreground mb-2 block">{fieldName}</Label>
                        {renderKeywords(items)}
                      </div>
                    );
                  } else if (key.toLowerCase().includes('description') || key.toLowerCase().includes('subject')) {
                    // Handle description fields with styled background
                    return (
                      <div key={key}>
                        <Label className="text-sm text-muted-foreground">{fieldName}</Label>
                        <p className="text-sm text-foreground bg-muted p-3 rounded-lg mt-1">
                          {String(value)}
                        </p>
                      </div>
                    );
                  } else {
                    // Handle regular text fields
                    return (
                      <div key={key}>
                        <Label className="text-sm text-muted-foreground">{fieldName}</Label>
                        <p className="text-sm text-foreground">{String(value)}</p>
                      </div>
                    );
                  }
                })}
              </CardContent>
            </Card>
          )}

          {/* Custom/Manual Metadata */}
          {file.customMetadata && Object.keys(file.customMetadata).length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Custom Metadata</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {Object.entries(file.customMetadata).map(([key, value]) => {
                  if (!value) return null;
                  
                  const fieldName = key.charAt(0).toUpperCase() + key.slice(1);
                  
                  return (
                    <div key={key} className="flex justify-between items-start">
                      <span className="text-sm text-muted-foreground">{fieldName}</span>
                      <span className="text-sm text-foreground">{String(value)}</span>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}

          {/* Existing Drive Metadata */}
          {file.existingMetadata && Object.keys(file.existingMetadata).length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Drive Metadata</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {Object.entries(file.existingMetadata).map(([key, value]) => {
                  if (!value) return null;
                  
                  const fieldName = key.charAt(0).toUpperCase() + key.slice(1);
                  
                  return (
                    <div key={key} className="flex justify-between items-start">
                      <span className="text-sm text-muted-foreground">{fieldName}</span>
                      <span className="text-sm text-foreground">{String(value)}</span>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}

          {/* Action Buttons */}
          {file.status === "processed" && file.aiGeneratedMetadata && (
            <div className="space-y-3">
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="outline" className="w-full">
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Verify Exported Metadata
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-4xl max-h-[80vh]">
                  <DialogHeader>
                    <DialogTitle>Exported Metadata Verification - All Files</DialogTitle>
                  </DialogHeader>
                  <AllFilesVerificationContent />
                </DialogContent>
              </Dialog>
              
              <Button 
                variant="outline"
                className="w-full"
                onClick={() => regenerateMetadataMutation.mutate()}
                disabled={regenerateMetadataMutation.isPending || file.status === "processing"}
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                {regenerateMetadataMutation.isPending ? "Regenerating..." : "Regenerate AI Metadata"}
              </Button>
            </div>
          )}
        </div>
      </ScrollArea>
    </aside>
  );
}

function AllFilesVerificationContent() {
  const { data: allVerifications, isLoading, error } = useQuery({
    queryKey: ["/api/verify/all-files"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/verify/all-files");
      return response.json();
    },
  });

  if (isLoading) {
    return <div className="p-4 text-center">Loading verification data for all files...</div>;
  }

  if (error) {
    return <div className="p-4 text-center text-red-500">Failed to load verification data</div>;
  }

  if (!allVerifications || allVerifications.length === 0) {
    return <div className="p-4 text-center">No verification data available</div>;
  }

  return (
    <ScrollArea className="max-h-[60vh]">
      <div className="space-y-6 p-4">
        {allVerifications.map((verification: any, index: number) => {
          const driveProperties = verification.driveProperties || {};
          const hasExportedData = Object.keys(driveProperties).some(key => key.startsWith('AI_'));
          
          return (
            <Card key={index} className="border">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center justify-between">
                  <span>{verification.fileName}</span>
                  {hasExportedData ? (
                    <Badge variant="secondary" className="bg-green-100 text-green-800">✅ Exported</Badge>
                  ) : (
                    <Badge variant="secondary" className="bg-orange-100 text-orange-800">⚠️ Not Exported</Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {hasExportedData ? (
                  <div className="space-y-3">
                    <Label className="text-sm font-medium text-green-600">Metadata Successfully Exported to Google Drive</Label>
                    <div className="bg-muted rounded-lg p-3 space-y-2">
                      {Object.entries(driveProperties)
                        .filter(([key]) => key.startsWith('AI_'))
                        .map(([key, value]) => (
                          <div key={key}>
                            <Label className="text-xs text-muted-foreground">{key}</Label>
                            <p className="text-sm text-foreground break-words">{String(value)}</p>
                          </div>
                        ))}
                    </div>
                    
                    {Object.keys(driveProperties).filter(key => !key.startsWith('AI_')).length > 0 && (
                      <details className="mt-3">
                        <summary className="text-sm font-medium cursor-pointer">Other Google Drive Properties</summary>
                        <div className="mt-2 space-y-1 bg-muted rounded-lg p-2">
                          {Object.entries(driveProperties)
                            .filter(([key]) => !key.startsWith('AI_'))
                            .map(([key, value]) => (
                              <div key={key} className="text-xs">
                                <span className="font-mono text-muted-foreground">{key}:</span>
                                <span className="ml-2 break-words">{String(value)}</span>
                              </div>
                            ))}
                        </div>
                      </details>
                    )}
                  </div>
                ) : (
                  <div>
                    <Label className="text-sm font-medium text-orange-600">No exported metadata found in Google Drive</Label>
                    <p className="text-sm text-muted-foreground mt-2">
                      Use the bulk export feature to save metadata as Google Drive properties.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </ScrollArea>
  );
}
