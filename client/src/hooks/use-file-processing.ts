import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";

export function useFileProcessing() {
  const processFileMutation = useMutation({
    mutationFn: async ({ fileId, templateId }: { fileId: number; templateId?: number }) => {
      const response = await apiRequest("POST", `/api/process/file/${fileId}`, { templateId });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/drive/files"] });
    },
  });

  const processBatchMutation = useMutation({
    mutationFn: async ({ folderId, templateId }: { folderId: string; templateId?: number }) => {
      const response = await apiRequest("POST", "/api/process/batch", { folderId, templateId });
      return response.json();
    },
  });

  const getJobQuery = (jobId: number) => {
    return useQuery({
      queryKey: ["/api/jobs", jobId],
      enabled: !!jobId,
      refetchInterval: 2000, // Poll every 2 seconds
    });
  };

  const getJobsQuery = useQuery({
    queryKey: ["/api/jobs"],
  });

  return {
    processFileMutation,
    processBatchMutation,
    getJobQuery,
    getJobsQuery,
  };
}
