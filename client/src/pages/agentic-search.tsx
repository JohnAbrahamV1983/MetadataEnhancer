import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Loader2, Search, Bot, FileText, Image, Video, File, ExternalLink, FolderOpen } from "lucide-react";
import { DriveFile } from "@shared/schema";
import Header from "@/components/header";
import Sidebar from "@/components/sidebar";
import FolderBrowser from "@/components/folder-browser";

interface AgenticSearchResult {
  files: DriveFile[];
  reasoning: string;
  searchQuery: string;
  totalResults: number;
}

export default function AgenticSearchPage() {
  const [query, setQuery] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [currentFolderId, setCurrentFolderId] = useState("root");
  const [showFolderDialog, setShowFolderDialog] = useState(false);

  const { data: searchResults, isLoading, error } = useQuery({
    queryKey: ["/api/agentic-search", searchQuery, currentFolderId],
    queryFn: async () => {
      if (!searchQuery) return null;
      const params = new URLSearchParams({
        q: searchQuery,
        folderId: currentFolderId
      });
      const response = await fetch(`/api/agentic-search?${params.toString()}`);
      if (!response.ok) {
        throw new Error('Failed to perform agentic search');
      }
      return await response.json() as AgenticSearchResult;
    },
    enabled: !!searchQuery,
  });

  // Get folder name for display
  const { data: folders } = useQuery({
    queryKey: ["/api/drive/folders"],
  });

  // Analytics query for the current folder  
  const { data: analytics } = useQuery({
    queryKey: ["/api/analytics", currentFolderId],
    queryFn: async () => {
      const response = await fetch(`/api/analytics/${currentFolderId}`);
      if (!response.ok) throw new Error('Failed to fetch analytics');
      return response.json();
    },
  });

  const selectedFolder = (folders as any)?.find?.((f: any) => f.id === currentFolderId);
  const folderName = selectedFolder?.name || "Root";

  const handleSearch = async () => {
    if (!query.trim()) return;
    setIsSearching(true);
    setSearchQuery(query);
    setTimeout(() => setIsSearching(false), 500);
  };

  const getFileIcon = (file: DriveFile) => {
    const mimeType = file.mimeType || "";
    if (mimeType.startsWith("image/")) {
      return <Image className="h-4 w-4 text-blue-500" />;
    } else if (mimeType.startsWith("video/")) {
      return <Video className="h-4 w-4 text-red-500" />;
    } else if (mimeType.includes("pdf")) {
      return <FileText className="h-4 w-4 text-red-600" />;
    }
    return <File className="h-4 w-4 text-gray-500" />;
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return "Unknown size";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  };

  return (
    <div className="h-screen bg-background flex flex-col">
      <Header 
        currentFolderId={currentFolderId}
        onFolderChange={setCurrentFolderId}
        onStartProcessing={() => {}}
      />
      
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        
        {/* Search Interface */}
        <div className="flex-1 p-6 overflow-auto">
          <div className="max-w-4xl mx-auto space-y-6">
            
            {/* Page Header */}
            <div className="text-center mb-8">
              <h1 className="text-3xl font-bold text-foreground mb-2">Agentic Search</h1>
              <p className="text-muted-foreground">
                Ask questions in natural language to find your files intelligently using AI
              </p>
            </div>
            
            {/* Folder Selection */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FolderOpen className="h-5 w-5" />
                  Search Location
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4">
                  <div className="flex-1">
                    <p className="text-sm text-muted-foreground mb-2">Currently searching in:</p>
                    <div className="flex items-center gap-2 mb-3">
                      <Badge variant="outline" className="px-3 py-1">
                        {folderName}
                      </Badge>
                    </div>
                    
                    {/* Analytics Display */}
                    {analytics && (
                      <div className="space-y-2 p-3 bg-muted/30 rounded-lg">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Folder Statistics</p>
                        <div className="grid grid-cols-2 gap-3 text-sm">
                          <div>
                            <div className="flex items-center justify-between">
                              <span className="text-muted-foreground">Files with AI Tags:</span>
                              <div className="flex items-center gap-1">
                                <span className="font-medium">{(analytics as any).filesWithAI}</span>
                                <span className="text-muted-foreground">/ {(analytics as any).totalFiles}</span>
                                <Badge variant="secondary" className="text-xs px-1.5 py-0.5">
                                  {(analytics as any).filesWithAIPercentage}%
                                </Badge>
                              </div>
                            </div>
                          </div>
                          <div>
                            <div className="flex items-center justify-between">
                              <span className="text-muted-foreground">AI Fields Filled:</span>
                              <div className="flex items-center gap-1">
                                <span className="font-medium">{(analytics as any).totalFilledFields}</span>
                                <span className="text-muted-foreground">/ {(analytics as any).totalPossibleFields}</span>
                                <Badge variant="secondary" className="text-xs px-1.5 py-0.5">
                                  {(analytics as any).filledFieldsPercentage}%
                                </Badge>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                  <Dialog open={showFolderDialog} onOpenChange={setShowFolderDialog}>
                    <DialogTrigger asChild>
                      <Button variant="outline">
                        <FolderOpen className="h-4 w-4 mr-2" />
                        Change Folder
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl max-h-[70vh]">
                      <DialogHeader>
                        <DialogTitle>Select Search Folder</DialogTitle>
                      </DialogHeader>
                      <div className="py-4">
                        <FolderBrowser
                          selectedFolderId={currentFolderId}
                          onFolderSelect={(folderId) => {
                            setCurrentFolderId(folderId);
                            setShowFolderDialog(false);
                            setSearchQuery(""); // Clear previous search
                          }}
                        />
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
              </CardContent>
            </Card>

            {/* Search Bar */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Bot className="h-5 w-5" />
                  Natural Language Query
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex space-x-2 mb-4">
                  <div className="flex-1 relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="e.g., 'Find all photos with people in them' or 'Show me documents about marketing'"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                      className="pl-10 text-base"
                    />
                  </div>
                  <Button 
                    onClick={handleSearch}
                    disabled={!query.trim() || isSearching || isLoading}
                    className="px-6"
                  >
                    {(isSearching || isLoading) ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Bot className="h-4 w-4" />
                    )}
                    Search
                  </Button>
                </div>

                {/* Example queries */}
                <div>
                  <p className="text-sm text-muted-foreground mb-2">Try these example queries:</p>
                  <div className="flex flex-wrap gap-2">
                    {[
                      "Find photos with cars in them",
                      "Show me documents about business",
                      "Find images with text or signs",
                      "Show me all video files",
                      "Find files created last month"
                    ].map((example) => (
                      <Button
                        key={example}
                        variant="outline"
                        size="sm"
                        onClick={() => setQuery(example)}
                        className="text-xs"
                      >
                        {example}
                      </Button>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Search Results */}
            {searchResults && (
              <div className="space-y-6">
                {/* AI Reasoning */}
                {searchResults.reasoning && (
                  <Card className="border-primary/20 bg-primary/5">
                    <CardHeader className="pb-3">
                      <div className="flex items-center space-x-2">
                        <Bot className="h-5 w-5 text-primary" />
                        <CardTitle className="text-lg">AI Analysis</CardTitle>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm leading-relaxed">{searchResults.reasoning}</p>
                    </CardContent>
                  </Card>
                )}

                {/* Results Summary */}
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-semibold">
                    Search Results ({searchResults.totalResults} files found)
                  </h2>
                  <Badge variant="secondary" className="text-sm">
                    Query: "{searchResults.searchQuery}"
                  </Badge>
                </div>

                <Separator />

                {/* Results Grid */}
                {searchResults.files.length > 0 ? (
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {searchResults.files.map((file) => (
                      <Card key={file.id} className="hover:shadow-md transition-shadow">
                        <CardHeader className="pb-3">
                          <div className="flex items-start space-x-3">
                            {getFileIcon(file)}
                            <div className="flex-1 min-w-0">
                              <CardTitle className="text-sm font-medium truncate">
                                {file.name}
                              </CardTitle>
                              <CardDescription className="text-xs">
                                {formatFileSize(Number(file.size))} • {file.type}
                              </CardDescription>
                            </div>
                            {file.webViewLink && (
                              <Button
                                variant="ghost"
                                size="sm"
                                asChild
                                className="h-auto p-0"
                              >
                                <a
                                  href={file.webViewLink}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  <ExternalLink className="h-3 w-3" />
                                </a>
                              </Button>
                            )}
                          </div>
                        </CardHeader>
                        <CardContent className="pt-0">
                          {/* AI Generated Metadata */}
                          {file.aiGeneratedMetadata && Object.keys(file.aiGeneratedMetadata as any).length > 0 && (
                            <div className="space-y-2">
                              <p className="text-xs font-medium text-muted-foreground">AI Analysis:</p>
                              <div className="space-y-1">
                                {Object.entries(file.aiGeneratedMetadata as any).map(([key, value]) => (
                                  <div key={key} className="text-xs">
                                    <span className="font-medium">{key}:</span>{" "}
                                    <span className="text-muted-foreground">
                                      {Array.isArray(value) ? value.join(", ") : String(value)}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* File Status */}
                          <div className="mt-3 pt-3 border-t">
                            <Badge
                              variant={file.status === "processed" ? "default" : "secondary"}
                              className="text-xs"
                            >
                              {file.status}
                            </Badge>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <Card>
                    <CardContent className="py-8 text-center">
                      <Search className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                      <h3 className="text-lg font-medium mb-2">No files found</h3>
                      <p className="text-muted-foreground">
                        Try refining your search query or check if your files have been processed.
                      </p>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}

            {/* Loading State */}
            {isLoading && (
              <div className="flex items-center justify-center py-12">
                <div className="text-center">
                  <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
                  <p className="text-muted-foreground">AI is analyzing your query...</p>
                </div>
              </div>
            )}

            {/* Error State */}
            {error && (
              <Card className="border-destructive/20 bg-destructive/5">
                <CardContent className="py-6">
                  <p className="text-destructive text-center">
                    Failed to perform agentic search. Please try again.
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}