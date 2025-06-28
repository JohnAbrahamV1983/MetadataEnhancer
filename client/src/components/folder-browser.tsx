import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, ChevronDown, Folder, FolderOpen, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

interface FolderInfo {
  id: string;
  name: string;
  path: string;
}

interface FolderBrowserProps {
  selectedFolderId: string;
  onFolderSelect: (folderId: string) => void;
}

interface FolderNode extends FolderInfo {
  children?: FolderNode[];
  isExpanded?: boolean;
  level: number;
}

export default function FolderBrowser({ selectedFolderId, onFolderSelect }: FolderBrowserProps) {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(["root"]));
  
  const { data: allFolders = [] } = useQuery({
    queryKey: ["/api/drive/folders"],
  });

  // Build folder tree structure
  const buildFolderTree = (folders: FolderInfo[]): FolderNode[] => {
    const folderMap = new Map<string, FolderNode>();
    const rootFolders: FolderNode[] = [];

    // Add root folder
    const rootFolder: FolderNode = {
      id: "root",
      name: "My Drive", 
      path: "My Drive",
      level: 0,
      children: []
    };
    folderMap.set("root", rootFolder);
    rootFolders.push(rootFolder);

    // Create all folder nodes with simpler structure
    folders.forEach(folder => {
      const node: FolderNode = {
        ...folder,
        level: 1, // Simple flat structure under root for now
        children: []
      };
      folderMap.set(folder.id, node);
      rootFolder.children!.push(node); // All folders go under root for simplicity
    });

    // Sort folders alphabetically
    rootFolder.children!.sort((a, b) => a.name.localeCompare(b.name));

    return rootFolders;
  };

  const folderTree = buildFolderTree(allFolders);

  const toggleFolder = (folderId: string) => {
    const newExpanded = new Set(expandedFolders);
    if (newExpanded.has(folderId)) {
      newExpanded.delete(folderId);
    } else {
      newExpanded.add(folderId);
    }
    setExpandedFolders(newExpanded);
  };

  const renderFolderNode = (node: FolderNode) => {
    const isExpanded = expandedFolders.has(node.id);
    const isSelected = selectedFolderId === node.id;
    const hasChildren = node.children && node.children.length > 0;

    return (
      <div key={node.id}>
        <div
          className={cn(
            "flex items-center py-2 px-2 hover:bg-accent rounded-sm cursor-pointer transition-colors",
            isSelected && "bg-primary text-primary-foreground hover:bg-primary/90"
          )}
          style={{ paddingLeft: `${node.level * 16 + 8}px` }}
        >
          <div className="flex items-center flex-1" onClick={() => onFolderSelect(node.id)}>
            {hasChildren ? (
              <Button
                variant="ghost"
                size="sm"
                className="p-0 h-4 w-4 mr-1"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleFolder(node.id);
                }}
              >
                {isExpanded ? (
                  <ChevronDown className="h-3 w-3" />
                ) : (
                  <ChevronRight className="h-3 w-3" />
                )}
              </Button>
            ) : (
              <div className="w-5" />
            )}
            
            {node.id === "root" ? (
              <Home className="h-4 w-4 mr-2 text-blue-600" />
            ) : isExpanded ? (
              <FolderOpen className="h-4 w-4 mr-2 text-blue-600" />
            ) : (
              <Folder className="h-4 w-4 mr-2 text-blue-600" />
            )}
            
            <span className="text-sm truncate">{node.name}</span>
          </div>
        </div>
        
        {isExpanded && hasChildren && (
          <div>
            {node.children!.map(renderFolderNode)}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="border rounded-md">
      <div className="p-3 border-b bg-muted/30">
        <h4 className="text-sm font-medium">Browse Folders</h4>
        <p className="text-xs text-muted-foreground mt-1">
          Expand "My Drive" and click on any folder to select it for processing
        </p>
      </div>
      <ScrollArea className="h-64">
        <div className="p-2">
          {folderTree.map(renderFolderNode)}
        </div>
      </ScrollArea>
    </div>
  );
}