
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw, DollarSign } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

export default function CreditsDisplay() {
  const { data: balance, refetch, isLoading, error } = useQuery({
    queryKey: ["/api/openai/balance"],
    refetchInterval: 30000, // Refresh every 30 seconds
    retry: 2,
    staleTime: 10000, // Consider data stale after 10 seconds
  });

  const handleRefresh = () => {
    refetch();
  };

  if (error) {
    return (
      <Card className="w-full max-w-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center space-x-2">
            <DollarSign className="h-4 w-4" />
            <span>OpenAI Credits</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-destructive">
            Failed to load balance
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleRefresh}
            className="mt-2"
          >
            <RefreshCw className="h-3 w-3 mr-1" />
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <DollarSign className="h-4 w-4" />
            <span>OpenAI Credits</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRefresh}
            disabled={isLoading}
            className="h-6 w-6 p-0"
          >
            <RefreshCw className={`h-3 w-3 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            <div className="h-6 bg-muted animate-pulse rounded"></div>
            <div className="h-4 bg-muted animate-pulse rounded w-2/3"></div>
          </div>
        ) : balance ? (
          <div className="space-y-2">
            <div className="text-2xl font-bold text-green-600">
              ${balance.balance?.toFixed(2) || '0.00'}
            </div>
            <Badge variant="outline" className="text-xs">
              {balance.currency || 'USD'} • Live Balance
            </Badge>
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">
            No balance data available
          </div>
        )}
      </CardContent>
    </Card>
  );
}
