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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { MoreHorizontal, XCircle, Trash2, Eye, Ban, ShieldOff, ChevronLeft, ChevronRight, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiGet, apiPatch, apiDelete } from "@/api/client";

interface Report {
  id: string; target_id: string; target_type: string; reason: string;
  details: string | null; status: string; created_at: string;
  reporter: { id: string; name: string } | null;
  content: { text: string; author: string; authorId?: string } | null;
}

const typeLabels: Record<string, string> = {
  post:          "Post",
  user:          "User",
  profile:       "User",
  comment:       "Comment",
  message:       "Message",
  group_message: "Community Msg",
  community:     "Community",
  collab:        "Collab",
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

type SuspendDuration = "1h" | "24h" | "3d" | "7d" | "30d";
const durationLabels: Record<SuspendDuration, string> = { "1h": "1 Hour", "24h": "24 Hours", "3d": "3 Days", "7d": "7 Days", "30d": "30 Days" };
const durationMs: Record<SuspendDuration, number> = { "1h": 3600000, "24h": 86400000, "3d": 259200000, "7d": 604800000, "30d": 2592000000 };

export default function AdminReports() {
  const [reports, setReports]           = useState<Report[]>([]);
  const [total, setTotal]               = useState(0);
  const [page, setPage]                 = useState(1);
  const [statusFilter, setStatusFilter] = useState("pending");
  const [loading, setLoading]           = useState(true);

  // Review dialog
  const [reviewing, setReviewing]   = useState<Report | null>(null);

  // Ban dialog
  const [banTarget, setBanTarget]   = useState<{ reportId: string; userId: string; name: string } | null>(null);
  const [banReason, setBanReason]   = useState("");
  const [banning, setBanning]       = useState(false);

  // Suspend dialog
  const [suspendTarget, setSuspendTarget]     = useState<{ reportId: string; userId: string; name: string } | null>(null);
  const [suspendDuration, setSuspendDuration] = useState<SuspendDuration>("24h");
  const [suspending, setSuspending]           = useState(false);

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
      if (report.target_type === "post") {
        await apiDelete(`/api/admin/content/posts/${report.target_id}`);
      }
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

  // Get the user ID to act on from a report
  const getUserIdFromReport = (r: Report): string | null => {
    if (r.target_type === "user" || r.target_type === "profile") return r.target_id;
    if (r.content?.authorId) return r.content.authorId;
    return null;
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
              <SelectItem value="escalated">Escalated</SelectItem>
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
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reports.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No reports found</TableCell></TableRow>
                  ) : reports.map(r => (
                    <TableRow key={r.id}>
                      <TableCell>
                        <Badge variant="outline" className={`capitalize text-xs ${typeColors[r.target_type] || "bg-muted text-muted-foreground"}`}>
                          {typeLabels[r.target_type] || r.target_type || "—"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm font-medium capitalize">{r.reason?.replace(/_/g, " ") || "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[200px]">
                        <span className="line-clamp-2">{r.details || "—"}</span>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{r.reporter?.name ?? "Unknown"}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`capitalize text-xs ${statusColors[r.status] || ""}`}>{r.status}</Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setReviewing(r)}>
                              <Eye className="mr-2 h-4 w-4" /> Review
                            </DropdownMenuItem>
                            {r.status === "pending" && (
                              <>
                                <DropdownMenuSeparator />
                                {(r.target_type === "post" || r.target_type === "comment") && (
                                  <DropdownMenuItem onClick={() => removeContent(r)} className="text-destructive">
                                    <Trash2 className="mr-2 h-4 w-4" /> Remove Content
                                  </DropdownMenuItem>
                                )}
                                {getUserIdFromReport(r) && (
                                  <>
                                    <DropdownMenuItem onClick={() => {
                                      const uid = getUserIdFromReport(r)!;
                                      setSuspendTarget({ reportId: r.id, userId: uid, name: r.content?.author || "User" });
                                    }}>
                                      <ShieldOff className="mr-2 h-4 w-4" /> Suspend User
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => {
                                      const uid = getUserIdFromReport(r)!;
                                      setBanTarget({ reportId: r.id, userId: uid, name: r.content?.author || "User" });
                                    }} className="text-destructive">
                                      <Ban className="mr-2 h-4 w-4" /> Ban User
                                    </DropdownMenuItem>
                                  </>
                                )}
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => resolve(r.id, "dismissed")}>
                                  <XCircle className="mr-2 h-4 w-4" /> Dismiss
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
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

      {/* Review Dialog */}
      <Dialog open={!!reviewing} onOpenChange={open => !open && setReviewing(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Review Report</DialogTitle></DialogHeader>
          {reviewing && (
            <div className="space-y-4 py-1">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Type</p>
                  <Badge variant="outline" className={`capitalize text-xs ${typeColors[reviewing.target_type] || ""}`}>{typeLabels[reviewing.target_type] || reviewing.target_type || "—"}</Badge>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Status</p>
                  <Badge variant="outline" className={`capitalize text-xs ${statusColors[reviewing.status] || ""}`}>{reviewing.status}</Badge>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Reported By</p>
                  <p className="font-medium">{reviewing.reporter?.name ?? "Unknown"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Date</p>
                  <p>{new Date(reviewing.created_at).toLocaleDateString()}</p>
                </div>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Reason</p>
                <p className="text-sm font-medium capitalize">{reviewing.reason?.replace(/_/g, " ") || "—"}</p>
              </div>
              {reviewing.details && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Reporter's Note</p>
                  <p className="text-sm text-muted-foreground bg-muted rounded-md p-3">{reviewing.details}</p>
                </div>
              )}
              {reviewing.content?.text && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Reported Content · by {reviewing.content.author}</p>
                  <div className="text-sm bg-muted rounded-md p-3 border border-border">{reviewing.content.text}</div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Suspend Dialog */}
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

      {/* Ban Dialog */}
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
