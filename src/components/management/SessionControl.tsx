
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useActiveSession } from "@/hooks/useActiveSession";
import { useToast } from "@/components/ui/use-toast";
import { Play, Square } from "lucide-react";

export function SessionControl() {
  const { session, isLoading, startSession, endSession, refetch } = useActiveSession();
  const { toast } = useToast();

  const handleStart = async () => {
    await startSession();
    toast({ title: "Session started", description: "Daily session is now active" });
    refetch();
  };
  const handleEnd = async () => {
    await endSession();
    toast({ title: "Session ended", description: "Daily session has been closed" });
    refetch();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Daily Session</CardTitle>
      </CardHeader>
      <CardContent className="flex items-center justify-between">
        <div>
          {isLoading ? (
            <div className="text-muted-foreground">Loading...</div>
          ) : session ? (
            <div className="text-sm">
              <div className="font-medium">Active session</div>
              <div className="text-muted-foreground">
                Date: {session.session_date} • Started at: {new Date(session.started_at).toLocaleTimeString()}
              </div>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">No active session</div>
          )}
        </div>
        <div className="flex gap-2">
          {!session ? (
            <Button onClick={handleStart}>
              <Play className="h-4 w-4 mr-2" />
              Start Session
            </Button>
          ) : (
            <Button variant="destructive" onClick={handleEnd}>
              <Square className="h-4 w-4 mr-2" />
              End Session
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
