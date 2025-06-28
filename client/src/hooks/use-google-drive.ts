import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";

export function useGoogleDrive() {
  const authUrlQuery = useQuery({
    queryKey: ["/api/auth/google/url"],
    enabled: false,
  });

  const connectMutation = useMutation({
    mutationFn: async (code: string) => {
      const response = await apiRequest("POST", "/api/auth/google/callback", { code });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/drive/folders"] });
    },
  });

  const foldersQuery = useQuery({
    queryKey: ["/api/drive/folders"],
    enabled: false,
  });

  const getFilesQuery = (folderId: string) => {
    return useQuery({
      queryKey: ["/api/drive/files", folderId],
      enabled: !!folderId,
    });
  };

  return {
    authUrlQuery,
    connectMutation,
    foldersQuery,
    getFilesQuery,
  };
}
