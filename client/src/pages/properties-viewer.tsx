import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function PropertiesViewer() {
  const [fileId, setFileId] = useState("1dhtKfTS5lQpjd_r4A0OCeW7DiQOVmZ5M");
  const [activeFileId, setActiveFileId] = useState("");

  const { data: properties, isLoading, error } = useQuery({
    queryKey: ["/api/drive/properties", activeFileId],
    enabled: !!activeFileId,
  });

  const handleViewProperties = () => {
    setActiveFileId(fileId);
  };

  const sampleFileIds = [
    { id: "1dhtKfTS5lQpjd_r4A0OCeW7DiQOVmZ5M", name: "Image 1.jpg - Flight attendant" },
    { id: "1RxzfwWGuKJpReed8WeObbSmD8RonbZlC", name: "Image 2.jpg - Santa's sleigh" },
    { id: "1Z40wFci6rFvzmus3qgjZ9KHMElri7yql", name: "Image 7.jpg - Qatar Airways" },
    { id: "1Isd6HrwQO5N91n6HvACYiQlmquzAq6fc", name: "Image 9.jpg - Flight attendant uniform" },
  ];

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Google Drive Properties Viewer</h1>
        <p className="text-gray-600">
          View the AI metadata properties stored directly in Google Drive for your processed files.
        </p>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Enter File ID</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              value={fileId}
              onChange={(e) => setFileId(e.target.value)}
              placeholder="Enter Google Drive file ID"
              className="flex-1"
            />
            <Button onClick={handleViewProperties} disabled={!fileId}>
              View Properties
            </Button>
          </div>
          
          <div className="space-y-2">
            <p className="text-sm font-medium">Quick Examples:</p>
            {sampleFileIds.map((sample) => (
              <div key={sample.id} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                <span className="text-sm">{sample.name}</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setFileId(sample.id);
                    setActiveFileId(sample.id);
                  }}
                >
                  View
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {isLoading && (
        <Card>
          <CardContent className="p-6">
            <div className="text-center">Loading properties...</div>
          </CardContent>
        </Card>
      )}

      {error && (
        <Card>
          <CardContent className="p-6">
            <div className="text-center text-red-600">
              Error loading properties: {error.message}
            </div>
          </CardContent>
        </Card>
      )}

      {properties && (
        <Card>
          <CardHeader>
            <CardTitle>Google Drive Properties</CardTitle>
            <p className="text-sm text-gray-600">
              These properties are stored permanently in Google Drive's cloud servers.
            </p>
          </CardHeader>
          <CardContent>
            {Object.keys(properties).length === 0 ? (
              <p className="text-gray-500">No custom properties found for this file.</p>
            ) : (
              <div className="space-y-3">
                {Object.entries(properties).map(([key, value]) => (
                  <div key={key} className="flex flex-col sm:flex-row sm:items-center gap-2">
                    <Badge variant="outline" className="w-fit">
                      {key}
                    </Badge>
                    <span className="text-sm bg-gray-50 p-2 rounded flex-1">
                      {typeof value === 'string' ? value : String(value)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>What Are These Properties?</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm">
            <p><strong>Permanent Storage:</strong> These properties are stored directly in Google Drive's servers, not in this app.</p>
            <p><strong>Survives Everything:</strong> They remain even if you delete this app, change computers, or share files.</p>
            <p><strong>Team Accessible:</strong> Anyone with file access can see these properties.</p>
            <p><strong>API Accessible:</strong> Any authorized application can read and use this metadata.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}