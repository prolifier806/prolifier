import { useState, useEffect, useCallback } from "react";
import { AdminLayout } from "./AdminLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Eye, Trash2, XCircle, ChevronLeft, ChevronRight, Flag, MessageSquare, User } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiGet, apiPatch, apiDelete } from "@/api/client";

interface Report {
  id: string;
  target_id: string;
  target_type: string;
  reason: string;
  details: string | null;
  status: string;
  created_at: string;
  reporter: { id: string; name: string } | null;
  content: { text: string; author: string } | null;
}

const typeIcon: Record<string, any> = {
  post:    Flag,
  user:    User,
  comment: MessageSquare,
  profile: User,
};

const typeColors: Record<string, string> = {
  post:    "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  user:    "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  profile: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  comment: "bg-muted text-muted-foreground",
};

const reasonLabels: Record<string, string> = {
  spam: "Spam", hate_speech: "Hate Speech", harassment: "Harassment",
  misinformation: "Misinformation", inappropriate: "Inappropriate", other: "Other",
};

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function AdminReports() {
  const [reports, setReports]           = useState<Report[]>([]);
  const [total, setTotal]               = useState(0);
  const [page, setPage]                 = useState(1);
  const [statusFilter, setStatusFilter] = useState("pending");
  const [loading, setLoading]           = useState(true);
  const [reviewing, setReviewing]       = useState<Report | null>(null);
  const [actioning, setActioning]       = useState(false);
  const { toast } = useToast();

  const fetchReports = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiGet<any>(`/api/admin/reports?status=${statusFilter}&page=${page}`);
      setReports(res.data ?? res);
      setTotal(res.total ?? 0);
    } catch (e: any) {
      toast({ title: "Failed to load reports", description: e.message, variant: "destructive" });
    } finally { setLoading(false); }
  }, [statusFilter, page]);

  useEffect(() => { fetchReports(); }, [fetchReports]);
  useEffect(() => { setPage(1); }, [statusFilter]);

  const removeFromList = (id: string) => {
    setReports(prev => prev.filter(r => r.id !== id));
    setTotal(t => Math.max(0, t - 1));
    setReviewing(null);
  };

  const dismiss = async (report: Report) => {
    try {
      await apiPatch(`/api/admin/reports/${report.id}/resolve`, { resolution: "dismissed" });
      removeFromList(report.id);
      toast({ title: "Report dismissed" });
    } catch (e: any) {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    }
  };

  const removeContent = async (report: Report) => {
    setActioning(true);
    try {
      if (report.target_type === "post") {
        await apiDelete(`/api/admin/content/posts/${report.target_id}`);
      }
      await apiPatch(`/api/admin/reports/${report.id}/resolve`, { resolution: "actioned" });
      removeFromList(report.id);
      toast({ title: "Content removed", description: "Report marked as actioned." });
    } catch (e: any) {
      toast({ title: "Failed to remove content", description: e.message, variant: "destructive" });
    } finally { setActioning(false); }
  };

  const totalPages = Math.ceil(total / 25);

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Reports</h1>
            <p className="text-muted-foreground text-sm mt-1">{total} {statusFilter} report{total !== 1 ? "s" : ""}</p>
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="actioned">Actioned</SelectItem>
              <SelectItem value="dismissed">Dismissed</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {loading ? (
          <div className="space-y-3">{[1,2,3,4].map(i => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}</div>
        ) : reports.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Flag className="h-10 w-10 mx-auto mb-3 opacity-20" />
            <p className="text-sm">No {statusFilter} reports</p>
          </div>
        ) : (
          <div className="space-y-3">
            {reports.map(r => {
              const Icon = typeIcon[r.target_type] || Flag;
              return (
                <Card key={r.id} className="hover:shadow-sm transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-4">
                      {/* Icon */}
                      <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center shrink-0 mt-0.5">
                        <Icon className="h-4 w-4 text-muted-foreground" />
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <Badge variant="outline" className={`capitalize text-xs ${typeColors[r.target_type] || ""}`}>{r.target_type}</Badge>
                          <span className="text-sm font-medium">{reasonLabels[r.reason] || r.reason}</span>
                          <span className="text-xs text-muted-foreground">· by {r.reporter?.name ?? "Unknown"} · {timeAgo(r.created_at)}</span>
                        </div>
                        {r.content?.text ? (
                          <p className="text-xs text-muted-foreground line-clamp-2 bg-muted rounded px-2 py-1 mt-1">
                            "{r.content.text}"
                          </p>
                        ) : r.details ? (
                          <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{r.details}</p>
                        ) : null}
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 shrink-0">
                        <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => setReviewing(r)}>
                          <Eye className="h-3.5 w-3.5" /> Review
                        </Button>
                        {r.status === "pending" && (
                          <>
                            {r.target_type === "post" && (
                              <Button size="sm" variant="destructive" className="h-8 gap-1.5 text-xs" onClick={() => removeContent(r)} disabled={actioning}>
                                <Trash2 className="h-3.5 w-3.5" /> Remove
                              </Button>
                            )}
                            <Button size="sm" variant="ghost" className="h-8 gap-1.5 text-xs text-muted-foreground" onClick={() => dismiss(r)}>
                              <XCircle className="h-3.5 w-3.5" /> Dismiss
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between pt-2">
            <span className="text-xs text-muted-foreground">Page {page} of {totalPages}</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setPage(p => p - 1)} disabled={page === 1}><ChevronLeft className="h-4 w-4" /></Button>
              <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)} disabled={page >= totalPages}><ChevronRight className="h-4 w-4" /></Button>
            </div>
          </div>
        )}
      </div>

      {/* Review Dialog */}
      <Dialog open={!!reviewing} onOpenChange={open => !open && setReviewing(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Report Review</DialogTitle>
          </DialogHeader>
          {reviewing && (
            <div className="space-y-4">
              {/* Meta */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="space-y-0.5">
                  <p className="text-xs text-muted-foreground">Type</p>
                  <Badge variant="outline" className={`capitalize text-xs ${typeColors[reviewing.target_type] || ""}`}>{reviewing.target_type}</Badge>
                </div>
                <div className="space-y-0.5">
                  <p className="text-xs text-muted-foreground">Reason</p>
                  <p className="font-medium text-sm">{reasonLabels[reviewing.reason] || reviewing.reason}</p>
                </div>
                <div className="space-y-0.5">
                  <p className="text-xs text-muted-foreground">Reported By</p>
                  <p className="font-medium text-sm">{reviewing.reporter?.name ?? "Unknown"}</p>
                </div>
                <div className="space-y-0.5">
                  <p className="text-xs text-muted-foreground">Date</p>
                  <p className="text-sm">{new Date(reviewing.created_at).toLocaleDateString()}</p>
                </div>
              </div>

              {/* Reported content */}
              {reviewing.content?.text && (
                <div className="space-y-1.5">
                  <p className="text-xs text-muted-foreground">Reported Content · by {reviewing.content.author}</p>
                  <div className="bg-muted rounded-lg p-3 text-sm border border-border">
                    {reviewing.content.text}
                  </div>
                </div>
              )}

              {/* Reporter's note */}
              {reviewing.details && (
                <div className="space-y-1.5">
                  <p className="text-xs text-muted-foreground">Reporter's Note</p>
                  <div className="bg-muted/50 rounded-lg p-3 text-sm text-muted-foreground border border-border">
                    {reviewing.details}
                  </div>
                </div>
              )}

              {/* Actions */}
              {reviewing.status === "pending" && (
                <div className="flex gap-2 pt-1">
                  <Button variant="outline" className="flex-1" onClick={() => dismiss(reviewing)}>
                    <XCircle className="mr-2 h-4 w-4" /> Dismiss
                  </Button>
                  {reviewing.target_type === "post" && (
                    <Button variant="destructive" className="flex-1" onClick={() => removeContent(reviewing)} disabled={actioning}>
                      <Trash2 className="mr-2 h-4 w-4" /> {actioning ? "Removing…" : "Remove Content"}
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
