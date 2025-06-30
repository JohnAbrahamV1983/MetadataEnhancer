
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Search, FolderOpen, Image, Tag, Calendar, ExternalLink } from "lucide-react";
import { type DriveFile } from "@shared/schema";
import FolderBrowser from "@/components/folder-browser";
import Header from "@/components/header";
import Sidebar from "@/components/sidebar";

export default function SearchPage() {
  const [selectedFolderId, setSelectedFolderId] = useState("root");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<DriveFile[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showFolderDialog, setShowFolderDialog] = useState(false);

  // Get folder name for display
  const { data: folders } = useQuery({
    queryKey: ["/api/drive/folders"],
  });

  // Get analytics for the selected folder
  const { data: analytics } = useQuery({
    queryKey: ["/api/analytics", selectedFolderId],
    queryFn: async () => {
      const response = await fetch(`/api/analytics/${selectedFolderId}`);
      if (!response.ok) throw new Error('Failed to fetch analytics');
      return response.json();
    },
  });

  const selectedFolder = (folders as any)?.find?.((f: any) => f.id === selectedFolderId);
  const folderName = selectedFolder?.name || "Root";

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    
    setIsSearching(true);
    try {
      const response = await fetch(`/api/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: searchQuery,
          folderId: selectedFolderId
        })
      });
      
      if (response.ok) {
        const results = await response.json();
        setSearchResults(results);
      }
    } catch (error) {
      console.error('Search failed:', error);
    } finally {
      setIsSearching(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  return (
    <div className="h-screen bg-background flex flex-col">
      <Header 
        currentFolderId={selectedFolderId}
        onFolderChange={setSelectedFolderId}
        onStartProcessing={() => {}}
      />
      
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        
        {/* Search Interface */}
        <div className="flex-1 p-6 overflow-auto">
          <div className="max-w-4xl mx-auto space-y-6">
            
            {/* Page Header */}
            <div className="text-center mb-8">
              <h1 className="text-3xl font-bold text-foreground mb-2">AI Image Search</h1>
              <p className="text-muted-foreground">
                Search your Google Drive images using AI-generated metadata, descriptions, tags, and more
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
                                <span className="font-medium">{analytics.filesWithAI}</span>
                                <span className="text-muted-foreground">/ {analytics.totalFiles}</span>
                                <Badge variant="secondary" className="text-xs px-1.5 py-0.5">
                                  {analytics.filesWithAIPercentage}%
                                </Badge>
                              </div>
                            </div>
                          </div>
                          <div>
                            <div className="flex items-center justify-between">
                              <span className="text-muted-foreground">AI Fields Filled:</span>
                              <div className="flex items-center gap-1">
                                <span className="font-medium">{analytics.totalFilledFields}</span>
                                <span className="text-muted-foreground">/ {analytics.totalPossibleFields}</span>
                                <Badge variant="secondary" className="text-xs px-1.5 py-0.5">
                                  {analytics.filledFieldsPercentage}%
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
                          selectedFolderId={selectedFolderId}
                          onFolderSelect={(folderId) => {
                            setSelectedFolderId(folderId);
                            setShowFolderDialog(false);
                            setSearchResults([]); // Clear previous results
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
                  <Search className="h-5 w-5" />
                  AI Search Query
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex gap-2">
                  <Input
                    placeholder="Search for images by description, tags, content, or any metadata..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyPress={handleKeyPress}
                    className="flex-1"
                  />
                  <Button 
                    onClick={handleSearch}
                    disabled={isSearching || !searchQuery.trim()}
                  >
                    {isSearching ? "Searching..." : "Search"}
                  </Button>
                </div>
                <div className="mt-3">
                  <p className="text-sm text-muted-foreground">
                    Try searching for: "sunset", "person smiling", "red car", "outdoor scene", etc.
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Searches include all files and subfolders within the selected folder.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Search Results */}
            {searchResults.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Search Results ({searchResults.length} found)</CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[600px]">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {searchResults.map((file) => (
                        <SearchResultCard key={file.id} file={file} />
                      ))}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            )}

            {searchQuery && searchResults.length === 0 && !isSearching && (
              <Card>
                <CardContent className="text-center py-8">
                  <Search className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">No images found matching your search.</p>
                  <p className="text-sm text-muted-foreground mt-2">
                    Try different keywords or make sure the selected folder contains processed images.
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

function SearchResultCard({ file }: { file: DriveFile }) {
  const aiMetadata = (file.aiGeneratedMetadata || {}) as any;
  
  const handleImageClick = () => {
    if (file.webViewLink) {
      window.open(file.webViewLink, '_blank');
    }
  };
  
  return (
    <Card className="overflow-hidden">
      <div 
        className="aspect-video bg-muted flex items-center justify-center cursor-pointer hover:bg-muted/80 transition-colors"
        onClick={handleImageClick}
        title="Click to open in Google Drive"
      >
        {file.thumbnailLink ? (
          <img 
            src={file.thumbnailLink} 
            alt={file.name}
            className="w-full h-full object-cover hover:scale-105 transition-transform"
          />
        ) : (
          <Image className="h-8 w-8 text-muted-foreground" />
        )}
      </div>
      
      <CardContent className="p-4">
        <h3 className="font-medium text-sm mb-2 truncate">{file.name}</h3>
        
        {/* AI-Generated Metadata */}
        {aiMetadata.title && (
          <div className="mb-2">
            <Badge variant="secondary" className="text-xs">
              {aiMetadata.title}
            </Badge>
          </div>
        )}
        
        {aiMetadata.description && (
          <p className="text-xs text-muted-foreground mb-2 line-clamp-2">
            {aiMetadata.description}
          </p>
        )}
        
        {/* Tags */}
        {aiMetadata.tags && Array.isArray(aiMetadata.tags) && aiMetadata.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-2">
            {aiMetadata.tags.slice(0, 3).map((tag: string, index: number) => (
              <Badge key={index} variant="outline" className="text-xs">
                <Tag className="h-3 w-3 mr-1" />
                {tag}
              </Badge>
            ))}
            {aiMetadata.tags.length > 3 && (
              <Badge variant="outline" className="text-xs">
                +{aiMetadata.tags.length - 3} more
              </Badge>
            )}
          </div>
        )}
        
        {/* File Info and Actions */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {new Date(file.createdTime).toLocaleDateString()}
            </span>
            <Badge variant={file.status === 'processed' ? 'default' : 'secondary'} className="text-xs">
              {file.status}
            </Badge>
          </div>
          
          {file.webViewLink && (
            <Button 
              size="sm" 
              variant="outline" 
              className="w-full text-xs" 
              onClick={handleImageClick}
            >
              <ExternalLink className="h-3 w-3 mr-1" />
              View in Google Drive
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
