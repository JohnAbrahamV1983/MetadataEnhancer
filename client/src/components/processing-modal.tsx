import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Bot, X } from "lucide-react";

interface ProcessingModalProps {
  isOpen: boolean;
  onClose: () => void;
  folderId: string;
}

export default function ProcessingModal({ isOpen, onClose, folderId }: ProcessingModalProps) {
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("default");
  const [currentJobId, setCurrentJobId] = useState<number | null>(null);
  const { toast } = useToast();

  const { data: templates } = useQuery({
    queryKey: ["/api/templates"],
  });

  const { data: currentJob, refetch: refetchJob } = useQuery({
    queryKey: ["/api/jobs", currentJobId],
    enabled: !!currentJobId,
    refetchInterval: currentJobId && (!currentJob || currentJob.status === 'running') ? 1000 : false, // Poll every second when active
  });

  const startProcessingMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/process/batch", {
        folderId,
        templateId: selectedTemplateId !== "default" ? parseInt(selectedTemplateId) : undefined,
      });
      return response.json();
    },
    onSuccess: (data) => {
      setCurrentJobId(data.jobId);
      toast({
        title: "Processing started",
        description: "Batch processing has been initiated.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Processing failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Close modal when job is completed
  useEffect(() => {
    if (currentJob?.status === "completed") {
      setTimeout(() => {
        handleClose();
        toast({
          title: "Processing completed",
          description: `Successfully processed ${currentJob.processedFiles} files.`,
        });
        queryClient.invalidateQueries({ queryKey: ["/api/drive/files", folderId] });
      }, 2000);
    }
  }, [currentJob?.status, folderId, currentJob?.processedFiles]);

  const handleClose = () => {
    setCurrentJobId(null);
    setSelectedTemplateId("default");
    onClose();
  };

  const getProgress = () => {
    if (!currentJob) return 0;
    return (currentJob.processedFiles / currentJob.totalFiles) * 100;
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
              <Bot className="h-5 w-5 text-primary" />
            </div>
            Processing Files
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {!currentJobId && !startProcessingMutation.isPending ? (
            // Setup phase
            <>
              <p className="text-sm text-muted-foreground">
                AI will analyze your files and generate metadata based on the selected template.
              </p>

              <div className="space-y-3">
                <Label>Metadata Template (Optional)</Label>
                <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a template or use default" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="default">Default Template</SelectItem>
                    {templates?.map((template: any) => (
                      <SelectItem key={template.id} value={template.id.toString()}>
                        {template.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedTemplateId !== "default" && (
                  <p className="text-xs text-muted-foreground">
                    Selected template will define the metadata fields to generate.
                  </p>
                )}
              </div>

              <div className="flex gap-3">
                <Button 
                  onClick={() => startProcessingMutation.mutate()}
                  disabled={startProcessingMutation.isPending || !folderId}
                  className="flex-1"
                >
                  {startProcessingMutation.isPending ? "Starting..." : "Start Processing"}
                </Button>
                <Button variant="outline" onClick={handleClose}>
                  Cancel
                </Button>
              </div>
            </>
          ) : startProcessingMutation.isPending ? (
            // Starting phase
            <>
              <div className="text-center space-y-4">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                <p className="text-sm text-muted-foreground">
                  Initializing processing...
                </p>
              </div>
            </>
          ) : (
            // Processing phase
            <>
              <p className="text-sm text-muted-foreground">
                AI is analyzing your files and generating metadata...
              </p>

              {currentJob && (
                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between text-sm text-muted-foreground mb-2">
                      <span>Progress</span>
                      <span>
                        {currentJob.processedFiles} of {currentJob.totalFiles} files
                      </span>
                    </div>
                    <Progress value={getProgress()} className="h-2" />
                  </div>

                  {currentJob.status === "running" && (
                    <div className="text-center">
                      <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-primary mb-2"></div>
                      <p className="text-sm text-muted-foreground">
                        Processing files...
                      </p>
                    </div>
                  )}

                  {currentJob.status === "completed" && (
                    <div className="text-center text-accent">
                      <p className="text-sm font-medium">Processing completed!</p>
                      <p className="text-xs text-muted-foreground">
                        {currentJob.failedFiles > 0 && 
                          `${currentJob.failedFiles} files failed to process`}
                      </p>
                    </div>
                  )}

                  {currentJob.status === "failed" && (
                    <div className="text-center text-destructive">
                      <p className="text-sm font-medium">Processing failed</p>
                      <p className="text-xs text-muted-foreground">
                        {currentJob.errorMessage || "An error occurred during processing"}
                      </p>
                    </div>
                  )}
                </div>
              )}

              <div className="flex justify-center">
                <Button 
                  variant="outline" 
                  onClick={handleClose}
                  disabled={currentJob?.status === "running"}
                >
                  {currentJob?.status === "running" ? "Processing..." : "Close"}
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
