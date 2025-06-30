import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { 
  Folder, 
  Clock, 
  FileText, 
  BarChart3,
  RefreshCw,
  DollarSign,
  Edit
} from "lucide-react";

export default function Sidebar() {
  const [activeTab, setActiveTab] = useState("files");
  const [showBalanceDialog, setShowBalanceDialog] = useState(false);
  const [newBalance, setNewBalance] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: jobs } = useQuery({
    queryKey: ["/api/jobs"],
  });

  const { data: templates } = useQuery({
    queryKey: ["/api/templates"],
  });

  const { data: balance, refetch: refetchBalance, isLoading: balanceLoading, error: balanceError, isFetching } = useQuery({
    queryKey: ["/api/openai/balance"],
    refetchInterval: 30000, // Refresh every 30 seconds
    retry: 2,
    staleTime: 0, // Always consider data stale to force refresh
    gcTime: 0, // Don't cache data
  });

  const updateBalanceMutation = useMutation({
    mutationFn: async (balance: number) => {
      const response = await apiRequest("POST", "/api/openai/balance", { balance });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Balance updated",
        description: "Your OpenAI balance has been updated successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/openai/balance"] });
      setShowBalanceDialog(false);
      setNewBalance("");
    },
    onError: (error: any) => {
      toast({
        title: "Update failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleUpdateBalance = () => {
    const balanceValue = parseFloat(newBalance);
    if (isNaN(balanceValue) || balanceValue < 0) {
      toast({
        title: "Invalid balance",
        description: "Please enter a valid positive number.",
        variant: "destructive",
      });
      return;
    }
    updateBalanceMutation.mutate(balanceValue);
  };

  const tabs = [
    { id: "files", label: "File Browser", icon: Folder },
    { id: "queue", label: "Processing Queue", icon: Clock },
    { id: "templates", label: "Metadata Templates", icon: FileText },
    { id: "analytics", label: "Analytics", icon: BarChart3 },
  ];

  return (
    <aside className="w-64 bg-sidebar shadow-sm border-r border-sidebar-border flex flex-col">
      <nav className="p-4 space-y-2 flex-1">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          
          return (
            <Button
              key={tab.id}
              variant={isActive ? "default" : "ghost"}
              className={`w-full justify-start ${
                isActive 
                  ? "bg-sidebar-primary text-sidebar-primary-foreground" 
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              }`}
              onClick={() => setActiveTab(tab.id)}
            >
              <Icon className="h-4 w-4 mr-3" />
              {tab.label}
            </Button>
          );
        })}
      </nav>
      
      <div className="p-4 border-t border-sidebar-border">
        <div className="bg-muted rounded-lg p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center space-x-2">
              <DollarSign className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium text-muted-foreground">$ OpenAI Credits Available</span>
            </div>
            <div className="flex items-center space-x-1">
              <Dialog open={showBalanceDialog} onOpenChange={setShowBalanceDialog}>
                <DialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-auto p-0 text-muted-foreground hover:text-foreground"
                  >
                    <Edit className="h-3 w-3" />
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle>Update OpenAI Balance</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                      Enter your current balance from platform.openai.com/settings/organization/billing/overview
                    </p>
                    <div className="space-y-2">
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="e.g., 9.68"
                        value={newBalance}
                        onChange={(e) => setNewBalance(e.target.value)}
                      />
                      <div className="flex justify-end space-x-2">
                        <Button 
                          variant="outline" 
                          onClick={() => setShowBalanceDialog(false)}
                        >
                          Cancel
                        </Button>
                        <Button 
                          onClick={handleUpdateBalance}
                          disabled={updateBalanceMutation.isPending}
                        >
                          {updateBalanceMutation.isPending ? "Updating..." : "Update"}
                        </Button>
                      </div>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
              <Button
                variant="ghost"
                size="sm"
                onClick={async () => {
                  toast({
                    title: "Refreshing balance",
                    description: "Fetching latest balance data...",
                  });
                  const result = await refetchBalance();
                  if (result.data) {
                    toast({
                      title: "Balance refreshed",
                      description: `Current balance: $${result.data.balance?.toFixed(2)}`,
                    });
                  }
                }}
                disabled={isFetching}
                className="h-auto p-0 text-muted-foreground hover:text-foreground"
              >
                <RefreshCw className={`h-3 w-3 ${isFetching ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>
          
          {balanceError ? (
            <div className="text-xs text-destructive mb-2">
              Failed to load balance
            </div>
          ) : balanceLoading ? (
            <div className="space-y-2">
              <div className="h-4 bg-muted-foreground/20 animate-pulse rounded" />
              <div className="h-2 bg-muted-foreground/20 animate-pulse rounded" />
            </div>
          ) : balance ? (
            <div className="flex items-center justify-between">
              <span className="text-lg font-bold text-green-600">
                ${balance.balance?.toFixed(2) || '0.00'}
              </span>
              <span className="text-xs text-muted-foreground">
                {balance.currency || 'USD'}
              </span>
            </div>
          ) : (
            <div className="text-xs text-muted-foreground">
              No balance data available
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
