import { useState, useEffect, useCallback } from "react";
import { AdminLayout } from "./AdminLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Eye, Ban, ShieldOff, ChevronLeft, ChevronRight, AlertTriangle, Trash2, XCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiGet, apiPatch, apiDelete } from "@/api/client";

interface Report {
  id: string; target_id: string; target_type: string; reason: string;
  details: string | null; status: string; created_at: string;
  reporter: { id: string; name: string } | null;
  content: {
    text: string; author: string; authorId?: string;
    images?: string[]; video?: string | null; avatar?: string | null;
  } | null;
}

const typeLabels: Record<string, string> = {
  post: "Post", user: "User", profile: "User", comment: "Comment",
  message: "Message", group_message: "Community Msg", community: "Community", collab: "Collab",
};
const typeColors: Record<string, string> = {
  post:          "bg-primary/10 text-primary",
  user:          "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  profile:       "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  comment:       "bg-muted text-muted-foreground",
  message:       "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  group_message: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400",
  community:     "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  collab:        "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400",
};
const statusColors: Record<string, string> = {
  pending:   "bg-amber-100 text-amber-700",
  actioned:  "bg-emerald-100 text-emerald-700",
  dismissed: "bg-muted text-muted-foreground",
  escalated: "bg-red-100 text-red-700",
};

// "Post by John", "Comment by Jane", "User: John"
function contentByLabel(type: string, author: string): string {
  if (type === "user" || type === "profile") return `User: ${author}`;
  return `${typeLabels[type] || type} by ${author}`;
}

type SuspendDuration = "1h" | "24h" | "3d" | "7d" | "30d";
const durationLabels: Record<SuspendDuration, string> = { "1h": "1 Hour", "24h": "24 Hours", "3d": "3 Days", "7d": "7 Days", "30d": "30 Days" };
const durationMs: Record<SuspendDuration, number> = { "1h": 3600000, "24h": 86400000, "3d": 259200000, "7d": 604800000, "30d": 2592000000 };

const DETAILS_LIMIT = 160;

export default function AdminReports() {
  const [reports, setReports]           = useState<Report[]>([]);
  const [total, setTotal]               = useState(0);
  const [page, setPage]                 = useState(1);
  const [statusFilter, setStatusFilter] = useState("pending");
  const [loading, setLoading]           = useState(true);

  const [reviewing, setReviewing]           = useState<Report | null>(null);
  const [detailsExpanded, setDetailsExpanded] = useState(false);

  const [banTarget, setBanTarget]   = useState<{ reportId: string; userId: string; name: string } | null>(null);
  const [banReason, setBanReason]   = useState("");
  const [banning, setBanning]       = useState(false);

  const [suspendTarget, setSuspendTarget]     = useState<{ reportId: string; userId: string; name: string } | null>(null);
  const [suspendDuration, setSuspendDuration] = useState<SuspendDuration>("24h");
  const [suspending, setSuspending]           = useState(false);

  const { toast } = useToast();

  const fetchReports = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiGet<any>(`/api/admin/reports?status=${statusFilter}&page=${page}`);
      setReports(res.items ?? res.data ?? res ?? []);
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

  const resolve = async (id: string, resolution: "dismissed" | "actioned") => {
    try {
      await apiPatch(`/api/admin/reports/${id}/resolve`, { resolution });
      removeFromList(id);
      toast({ title: resolution === "actioned" ? "Report actioned" : "Report dismissed" });
    } catch (e: any) {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    }
  };

  const removeContent = async (report: Report) => {
    try {
      const tableMap: Record<string, string> = { post: "posts", comment: "comments", collab: "collabs" };
      const table = tableMap[report.target_type];
      if (table) await apiDelete(`/api/admin/content/${table}/${report.target_id}`);
      await resolve(report.id, "actioned");
      toast({ title: "Content removed" });
    } catch (e: any) {
      toast({ title: "Failed to remove content", description: e.message, variant: "destructive" });
    }
  };

  const banUser = async () => {
    if (!banTarget || !banReason.trim()) return;
    setBanning(true);
    try {
      await apiPatch(`/api/admin/users/${banTarget.userId}/status`, { status: "banned", reason: banReason.trim() });
      await resolve(banTarget.reportId, "actioned");
      setBanTarget(null); setBanReason("");
      toast({ title: "User banned", variant: "destructive" });
    } catch (e: any) {
      toast({ title: "Failed to ban", description: e.message, variant: "destructive" });
    } finally { setBanning(false); }
  };

  const suspendUser = async () => {
    if (!suspendTarget) return;
    setSuspending(true);
    try {
      const durationDays = durationMs[suspendDuration] / 86400000;
      await apiPatch(`/api/admin/users/${suspendTarget.userId}/status`, { status: "suspended", durationDays });
      await resolve(suspendTarget.reportId, "actioned");
      setSuspendTarget(null);
      toast({ title: "User suspended" });
    } catch (e: any) {
      toast({ title: "Failed to suspend", description: e.message, variant: "destructive" });
    } finally { setSuspending(false); }
  };

  const getUserIdFromReport = (r: Report): string | null => {
    if (r.target_type === "user" || r.target_type === "profile") return r.target_id;
    if (r.content?.authorId) return r.content.authorId;
    return null;
  };

  const openReview = (r: Report) => {
    setDetailsExpanded(false);
    setReviewing(r);
  };

  const totalPages = Math.ceil(total / 25);

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Reports</h1>
            <p className="text-muted-foreground text-sm mt-1">Review and resolve user reports</p>
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="actioned">Actioned</SelectItem>
              <SelectItem value="dismissed">Dismissed</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Card>
          <CardContent className="pt-6">
            {loading ? (
              <div className="space-y-3">{[1,2,3,4].map(i => <Skeleton key={i} className="h-12 w-full rounded" />)}</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Details</TableHead>
                    <TableHead>Reported By</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="w-20 text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reports.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-8">No reports found</TableCell>
                    </TableRow>
                  ) : reports.map(r => (
                    <TableRow key={r.id}>
                      <TableCell>
                        <Badge variant="outline" className={`capitalize text-xs ${typeColors[r.target_type] || "bg-muted text-muted-foreground"}`}>
                          {typeLabels[r.target_type] || r.target_type || "—"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm font-medium capitalize">{r.reason?.replace(/_/g, " ") || "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[180px]">
                        <span className="line-clamp-2">{r.details || "—"}</span>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{r.reporter?.name ?? "Unknown"}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`capitalize text-xs ${statusColors[r.status] || ""}`}>{r.status}</Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="outline" size="sm" onClick={() => openReview(r)} className="h-7 text-xs px-3">
                          <Eye className="mr-1.5 h-3 w-3" /> Review
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
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

      {/* ── Review Dialog ───────────────────────────────────────── */}
      <Dialog open={!!reviewing} onOpenChange={open => !open && setReviewing(null)}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-4 w-4" /> Review Report
            </DialogTitle>
          </DialogHeader>
          {reviewing && (
            <div className="space-y-4 py-1">

              {/* Meta grid */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Type</p>
                  <Badge variant="outline" className={`capitalize text-xs ${typeColors[reviewing.target_type] || ""}`}>
                    {typeLabels[reviewing.target_type] || reviewing.target_type || "—"}
                  </Badge>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Reported By</p>
                  <p className="font-medium text-sm">{reviewing.reporter?.name ?? "Unknown"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Reason</p>
                  <p className="text-sm font-medium capitalize">{reviewing.reason?.replace(/_/g, " ") || "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Date</p>
                  <p className="text-sm">{new Date(reviewing.created_at).toLocaleDateString()}</p>
                </div>
              </div>

              {/* Details with Read More dropdown */}
              {reviewing.details && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Details</p>
                  <div className="text-sm bg-muted rounded-md p-3 overflow-hidden">
                    <p className="break-all whitespace-pre-wrap">
                      {reviewing.details.length <= DETAILS_LIMIT
                        ? reviewing.details
                        : reviewing.details.slice(0, DETAILS_LIMIT) + "…"}
                    </p>
                    {reviewing.details.length > DETAILS_LIMIT && (
                      <>
                        <button
                          className="mt-1.5 text-primary text-xs font-medium hover:underline flex items-center gap-1"
                          onClick={() => setDetailsExpanded(v => !v)}
                        >
                          {detailsExpanded ? "▲ Show less" : "▼ Read more"}
                        </button>
                        {detailsExpanded && (
                          <div className="mt-2 border-t border-border/50 pt-2 max-h-32 overflow-y-auto overflow-x-hidden">
                            <p className="break-all whitespace-pre-wrap text-muted-foreground">
                              {reviewing.details.slice(DETAILS_LIMIT)}
                            </p>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* Reported content */}
              {reviewing.content && (
                <div>
                  <p className="text-xs text-muted-foreground mb-2">
                    {contentByLabel(reviewing.target_type, reviewing.content.author)}
                  </p>
                  <div className="rounded-lg border border-border bg-muted/40 overflow-hidden">
                    {/* Author row */}
                    <div className="flex items-center gap-2 p-3 pb-2">
                      {reviewing.content.avatar
                        ? <img src={reviewing.content.avatar} alt="" className="h-7 w-7 rounded-full object-cover shrink-0" />
                        : <div className="h-7 w-7 rounded-full bg-muted-foreground/20 flex items-center justify-center shrink-0 text-xs font-semibold">{reviewing.content.author?.[0]?.toUpperCase()}</div>
                      }
                      <span className="text-sm font-medium">{reviewing.content.author}</span>
                    </div>
                    {/* Text */}
                    {reviewing.content.text && !(reviewing.target_type === "user" || reviewing.target_type === "profile") && (
                      <p className="text-sm px-3 pb-3 whitespace-pre-wrap break-words">{reviewing.content.text}</p>
                    )}
                    {/* Images */}
                    {reviewing.content.images && reviewing.content.images.length > 0 && (
                      <div className={`grid gap-1 px-3 pb-3 ${reviewing.content.images.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
                        {reviewing.content.images.map((src, i) => (
                          <a key={i} href={src} target="_blank" rel="noreferrer">
                            <img
                              src={src}
                              alt={`media-${i}`}
                              className="w-full rounded-md object-cover max-h-64 cursor-pointer hover:opacity-90 transition-opacity"
                              onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                            />
                          </a>
                        ))}
                      </div>
                    )}
                    {/* Video */}
                    {reviewing.content.video && (
                      <div className="px-3 pb-3">
                        <video src={reviewing.content.video} controls className="w-full rounded-md max-h-64" />
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Action buttons */}
              {reviewing.status === "pending" && (
                <div className="border-t border-border pt-4">
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-3">Actions</p>
                  <div className="flex flex-wrap gap-2">
                    {(reviewing.target_type === "post" || reviewing.target_type === "comment" || reviewing.target_type === "collab") && (
                      <Button size="sm" variant="outline" className="text-destructive border-destructive/30 hover:bg-destructive/10"
                        onClick={() => removeContent(reviewing)}>
                        <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Remove Content
                      </Button>
                    )}
                    {getUserIdFromReport(reviewing) && (
                      <>
                        <Button size="sm" variant="outline" className="text-amber-600 border-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/30"
                          onClick={() => {
                            const uid = getUserIdFromReport(reviewing)!;
                            setReviewing(null);
                            setSuspendTarget({ reportId: reviewing.id, userId: uid, name: reviewing.content?.author || "User" });
                          }}>
                          <ShieldOff className="mr-1.5 h-3.5 w-3.5" /> Suspend User
                        </Button>
                        <Button size="sm" variant="outline" className="text-destructive border-destructive/30 hover:bg-destructive/10"
                          onClick={() => {
                            const uid = getUserIdFromReport(reviewing)!;
                            setReviewing(null);
                            setBanTarget({ reportId: reviewing.id, userId: uid, name: reviewing.content?.author || "User" });
                          }}>
                          <Ban className="mr-1.5 h-3.5 w-3.5" /> Ban User
                        </Button>
                      </>
                    )}
                    <Button size="sm" variant="outline" className="text-muted-foreground border-border hover:bg-muted"
                      onClick={() => resolve(reviewing.id, "dismissed")}>
                      <XCircle className="mr-1.5 h-3.5 w-3.5" /> Dismiss
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Suspend Dialog ──────────────────────────────────────── */}
      <Dialog open={!!suspendTarget} onOpenChange={open => !open && setSuspendTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><ShieldOff className="h-5 w-5 text-amber-500" /> Suspend {suspendTarget?.name}</DialogTitle>
            <DialogDescription>Suspended users cannot post or interact with content.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Label>Duration</Label>
            <Select value={suspendDuration} onValueChange={v => setSuspendDuration(v as SuspendDuration)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(durationLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSuspendTarget(null)}>Cancel</Button>
            <Button className="bg-amber-500 hover:bg-amber-600 text-white" onClick={suspendUser} disabled={suspending}>
              {suspending ? "Suspending…" : "Suspend"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Ban Dialog ──────────────────────────────────────────── */}
      <Dialog open={!!banTarget} onOpenChange={open => !open && setBanTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Ban className="h-5 w-5 text-destructive" /> Ban {banTarget?.name}</DialogTitle>
            <DialogDescription>Banned users cannot log in. This can be reversed by an admin.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-2">
              <Label>Reason <span className="text-destructive">*</span></Label>
              <Textarea placeholder="Reason for banning..." value={banReason} onChange={e => setBanReason(e.target.value)} rows={3} />
            </div>
            <div className="rounded-md border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <p>User will be immediately logged out and cannot access the platform.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBanTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={banUser} disabled={banning || !banReason.trim()}>
              {banning ? "Banning…" : "Ban Permanently"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
