import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { 
  Folder, 
  Clock, 
  FileText, 
  BarChart3,
  RefreshCw,
  DollarSign
} from "lucide-react";

export default function Sidebar() {
  const [activeTab, setActiveTab] = useState("files");

  const { data: jobs } = useQuery({
    queryKey: ["/api/jobs"],
  });

  const { data: templates } = useQuery({
    queryKey: ["/api/templates"],
  });

  const { data: balance, refetch: refetchBalance, isLoading: balanceLoading, error: balanceError } = useQuery({
    queryKey: ["/api/openai/balance"],
    refetchInterval: 30000, // Refresh every 30 seconds
    retry: 2,
    staleTime: 10000, // Consider data stale after 10 seconds
  });

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
              <span className="text-sm font-medium text-muted-foreground">OpenAI Credits</span>
            </div>
            <div className="flex items-center space-x-1">
              {balanceLoading ? (
                <div className="w-4 h-4 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => refetchBalance()}
                  className="h-auto p-0 text-muted-foreground hover:text-foreground"
                >
                  <RefreshCw className="h-3 w-3" />
                </Button>
              )}
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
            <>
              <div className="flex items-center justify-between mb-2">
                <span className="text-lg font-bold text-green-600">
                  ${balance.balance?.toFixed(2) || '0.00'}
                </span>
                <span className="text-xs text-muted-foreground">
                  {balance.currency || 'USD'}
                </span>
              </div>
              <Progress value={balance.percentage || 0} className="h-2" />
              <div className="flex justify-between text-xs text-muted-foreground mt-1">
                <span>Used: ${balance.used?.toFixed(2) || '0.00'}</span>
                <span>Total: ${balance.total?.toFixed(2) || '0.00'}</span>
              </div>
            </>
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
