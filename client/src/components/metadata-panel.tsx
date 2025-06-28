import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { type DriveFile } from "@shared/schema";
import { Save, RefreshCw, Calendar, Monitor, Camera } from "lucide-react";

interface MetadataPanelProps {
  file: DriveFile | null;
  onFileUpdate: (file: DriveFile) => void;
}

export default function MetadataPanel({ file, onFileUpdate }: MetadataPanelProps) {
  const [customMetadata, setCustomMetadata] = useState<Record<string, any>>({});
  const { toast } = useToast();

  const saveMetadataMutation = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("No file selected");
      
      const response = await apiRequest("PATCH", `/api/files/${file.id}`, {
        customMetadata
      });
      return response.json();
    },
    onSuccess: (updatedFile) => {
      toast({
        title: "Metadata saved",
        description: "File metadata has been updated successfully.",
      });
      onFileUpdate(updatedFile);
    },
    onError: (error: any) => {
      toast({
        title: "Save failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

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
          {file.aiGeneratedMetadata && (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">AI-Generated Metadata</CardTitle>
                  <Badge variant="secondary" className="bg-accent/20 text-accent">Generated</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {file.aiGeneratedMetadata.description && (
                  <div>
                    <Label className="text-sm text-muted-foreground">Description</Label>
                    <p className="text-sm text-foreground bg-muted p-3 rounded-lg mt-1">
                      {file.aiGeneratedMetadata.description}
                    </p>
                  </div>
                )}
                
                {file.aiGeneratedMetadata.keywords && (
                  <div>
                    <Label className="text-sm text-muted-foreground mb-2 block">Keywords</Label>
                    {renderKeywords(file.aiGeneratedMetadata.keywords)}
                  </div>
                )}
                
                {file.aiGeneratedMetadata.category && (
                  <div>
                    <Label className="text-sm text-muted-foreground">Category</Label>
                    <p className="text-sm text-foreground">{file.aiGeneratedMetadata.category}</p>
                  </div>
                )}
                
                {file.aiGeneratedMetadata.mood && (
                  <div>
                    <Label className="text-sm text-muted-foreground">Mood</Label>
                    <p className="text-sm text-foreground">{file.aiGeneratedMetadata.mood}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Custom Metadata Fields */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Custom Fields</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="projectName" className="text-sm text-muted-foreground">Project Name</Label>
                <Input 
                  id="projectName"
                  placeholder="Enter project name"
                  value={customMetadata.projectName || file.customMetadata?.projectName || ""}
                  onChange={(e) => setCustomMetadata(prev => ({ ...prev, projectName: e.target.value }))}
                  className="mt-1"
                />
              </div>
              
              <div>
                <Label htmlFor="brand" className="text-sm text-muted-foreground">Brand</Label>
                <Select 
                  value={customMetadata.brand || file.customMetadata?.brand || ""}
                  onValueChange={(value) => setCustomMetadata(prev => ({ ...prev, brand: value }))}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select brand" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="brand-a">Brand A</SelectItem>
                    <SelectItem value="brand-b">Brand B</SelectItem>
                    <SelectItem value="brand-c">Brand C</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Label htmlFor="usageRights" className="text-sm text-muted-foreground">Usage Rights</Label>
                <Select 
                  value={customMetadata.usageRights || file.customMetadata?.usageRights || ""}
                  onValueChange={(value) => setCustomMetadata(prev => ({ ...prev, usageRights: value }))}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select usage rights" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="commercial">Commercial Use</SelectItem>
                    <SelectItem value="editorial">Editorial Use</SelectItem>
                    <SelectItem value="internal">Internal Use Only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Action Buttons */}
          <div className="space-y-3">
            <Button 
              className="w-full"
              onClick={() => saveMetadataMutation.mutate()}
              disabled={saveMetadataMutation.isPending}
            >
              <Save className="h-4 w-4 mr-2" />
              {saveMetadataMutation.isPending ? "Saving..." : "Save Metadata"}
            </Button>
            
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
        </div>
      </ScrollArea>
    </aside>
  );
}
