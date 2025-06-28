import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { 
  Folder, 
  Clock, 
  FileText, 
  BarChart3 
} from "lucide-react";

export default function Sidebar() {
  const [activeTab, setActiveTab] = useState("files");

  const { data: jobs } = useQuery({
    queryKey: ["/api/jobs"],
  });

  const { data: templates } = useQuery({
    queryKey: ["/api/templates"],
  });

  // Simulate OpenAI credits for demo
  const credits = {
    remaining: 1250,
    total: 2000,
    percentage: 62.5
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
            <span className="text-sm font-medium text-muted-foreground">OpenAI Credits</span>
            <span className="text-sm text-foreground">{credits.remaining.toLocaleString()}</span>
          </div>
          <Progress value={credits.percentage} className="h-2" />
          <div className="flex justify-between text-xs text-muted-foreground mt-1">
            <span>Used: {(credits.total - credits.remaining).toLocaleString()}</span>
            <span>Total: {credits.total.toLocaleString()}</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
