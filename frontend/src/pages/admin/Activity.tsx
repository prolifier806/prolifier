import { useState, useEffect, useCallback } from "react";
import { AdminLayout } from "./AdminLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiGet } from "@/api/client";

interface Activity {
  id: string; action: string; reason: string | null; created_at: string;
  admin: { name: string } | null;
  target: { name: string } | null;
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

const actionColors: Record<string, string> = {
  banned:    "bg-red-500",
  suspended: "bg-amber-500",
  active:    "bg-emerald-500",
};

export default function AdminActivity() {
  const [logs, setLogs]   = useState<Activity[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage]   = useState(1);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchActivity = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiGet<any>(`/api/admin/activity?page=${page}`);
      setLogs(res.data ?? res);
      setTotal(res.total ?? 0);
    } catch (e: any) {
      toast({ title: "Failed to load activity", description: e.message, variant: "destructive" });
    } finally { setLoading(false); }
  }, [page]);

  useEffect(() => { fetchActivity(); }, [fetchActivity]);

  const totalPages = Math.ceil(total / 50);

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Activity Log</h1>
          <p className="text-muted-foreground text-sm mt-1">Admin actions and moderation history</p>
        </div>

        <Card>
          <CardContent className="pt-6">
            {loading ? (
              <div className="space-y-3">{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-12 w-full rounded" />)}</div>
            ) : logs.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No admin activity recorded yet.</p>
            ) : (
              <div className="space-y-1">
                {logs.map(log => (
                  <div key={log.id} className="flex items-center gap-4 py-3 px-3 rounded-md hover:bg-accent/50 transition-colors">
                    <div className={`h-2 w-2 rounded-full flex-shrink-0 ${actionColors[log.action] || "bg-primary"}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm">
                        <span className="font-medium">{log.admin?.name ?? "Admin"}</span>{" "}
                        <span className="text-muted-foreground capitalize">{log.action}</span>{" "}
                        <span className="font-medium">{log.target?.name ?? "unknown user"}</span>
                      </p>
                      {log.reason && <p className="text-xs text-muted-foreground truncate">{log.reason}</p>}
                    </div>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">{timeAgo(log.created_at)}</span>
                  </div>
                ))}
              </div>
            )}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
                <span className="text-xs text-muted-foreground">Page {page} of {totalPages}</span>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setPage(p => p - 1)} disabled={page === 1}><ChevronLeft className="h-4 w-4" /></Button>
                  <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)} disabled={page >= totalPages}><ChevronRight className="h-4 w-4" /></Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
