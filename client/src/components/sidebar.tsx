
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
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
  Edit,
  FolderOpen,
  Search
} from "lucide-react";

export default function Sidebar() {
  const [activeTab, setActiveTab] = useState("files");
  const [showBalanceDialog, setShowBalanceDialog] = useState(false);
  const [newBalance, setNewBalance] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [location] = useLocation();

  const { data: jobs } = useQuery({
    queryKey: ["/api/jobs"],
  });

  const { data: templates } = useQuery({
    queryKey: ["/api/templates"],
  });

  const navigationItems = [
    { id: "file-manager", label: "File Manager", icon: FolderOpen, href: "/" },
    { id: "ai-search", label: "AI Search", icon: Search, href: "/search" },
  ];

  const tabs = [
    { id: "files", label: "File Browser", icon: Folder },
    { id: "queue", label: "Processing Queue", icon: Clock },
    { id: "templates", label: "Metadata Templates", icon: FileText },
    { id: "analytics", label: "Analytics", icon: BarChart3 },
  ];

  return (
    <aside className="w-64 bg-sidebar shadow-sm border-r border-sidebar-border flex flex-col">
      {/* Navigation Section */}
      <div className="p-4 border-b border-sidebar-border">
        <h3 className="text-sm font-semibold text-sidebar-foreground mb-3 uppercase tracking-wide">
          Navigation
        </h3>
        <div className="space-y-1">
          {navigationItems.map((item) => {
            const Icon = item.icon;
            const isActive = location === item.href;

            return (
              <Link key={item.id} href={item.href}>
                <Button
                  variant={isActive ? "default" : "ghost"}
                  className={`w-full justify-start ${
                    isActive 
                      ? "bg-sidebar-primary text-sidebar-primary-foreground" 
                      : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  }`}
                >
                  <Icon className="h-4 w-4 mr-3" />
                  {item.label}
                </Button>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Tools Section */}
      <nav className="p-4 space-y-2 flex-1">
        <h3 className="text-sm font-semibold text-sidebar-foreground mb-3 uppercase tracking-wide">
          Tools
        </h3>
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
    </aside>
  );
}
