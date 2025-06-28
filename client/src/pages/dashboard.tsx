import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Header from "@/components/header";
import Sidebar from "@/components/sidebar";
import FileGrid from "@/components/file-grid";
import MetadataPanel from "@/components/metadata-panel";
import ProcessingModal from "@/components/processing-modal";
import { type DriveFile } from "@shared/schema";

export default function Dashboard() {
  const [selectedFile, setSelectedFile] = useState<DriveFile | null>(null);
  const [currentFolderId, setCurrentFolderId] = useState<string>("");
  const [showProcessingModal, setShowProcessingModal] = useState(false);

  const { data: folders } = useQuery({
    queryKey: ["/api/drive/folders"],
    enabled: false, // Will be enabled after authentication
  });

  const { data: files, refetch: refetchFiles } = useQuery({
    queryKey: [`/api/drive/files/${currentFolderId}`, currentFolderId],
    enabled: !!currentFolderId,
  });

  const handleFileSelect = (file: DriveFile) => {
    setSelectedFile(file);
  };

  const handleStartProcessing = () => {
    setShowProcessingModal(true);
  };

  return (
    <div className="h-screen bg-background flex flex-col">
      <Header 
        currentFolderId={currentFolderId}
        onFolderChange={setCurrentFolderId}
        onStartProcessing={handleStartProcessing}
      />
      
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        
        <FileGrid
          files={files || []}
          onFileSelect={handleFileSelect}
          selectedFileId={selectedFile?.id}
          currentFolderId={currentFolderId}
          onRefresh={refetchFiles}
        />
        
        <MetadataPanel
          file={selectedFile}
          onFileUpdate={(updatedFile) => {
            setSelectedFile(updatedFile);
            refetchFiles();
          }}
        />
      </div>

      <ProcessingModal
        isOpen={showProcessingModal}
        onClose={() => setShowProcessingModal(false)}
        folderId={currentFolderId}
      />
    </div>
  );
}
