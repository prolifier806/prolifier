import { useState, useEffect, useCallback } from "react";
import { AdminLayout } from "./AdminLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { MoreHorizontal, XCircle, Trash2, Eye, ChevronLeft, ChevronRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiGet, apiPatch, apiDelete } from "@/api/client";

interface Report {
  id: string; target_id: string; target_type: string; reason: string;
  details: string | null; status: string; created_at: string;
  reporter: { id: string; name: string } | null;
  content: { text: string; author: string } | null;
}

const typeColors: Record<string, string> = {
  post:    "bg-primary/10 text-primary",
  user:    "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  comment: "bg-muted text-muted-foreground",
  profile: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
};
const statusColors: Record<string, string> = {
  pending:   "bg-amber-100 text-amber-700",
  actioned:  "bg-emerald-100 text-emerald-700",
  dismissed: "bg-muted text-muted-foreground",
};
const reasonLabels: Record<string, string> = {
  spam: "Spam", hate_speech: "Hate Speech", harassment: "Harassment",
  misinformation: "Misinformation", inappropriate: "Inappropriate", other: "Other",
};

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
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reports.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No reports found</TableCell></TableRow>
                  ) : reports.map(r => (
                    <TableRow key={r.id}>
                      <TableCell>
                        <Badge variant="outline" className={`capitalize text-xs ${typeColors[r.target_type] || ""}`}>{r.target_type}</Badge>
                      </TableCell>
                      <TableCell className="text-sm font-medium">{reasonLabels[r.reason] || r.reason}</TableCell>
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
                              <Eye className="mr-2 h-4 w-4" /> Review Report
                            </DropdownMenuItem>
                            {r.status === "pending" && (
                              <>
                                <DropdownMenuSeparator />
                                {r.target_type === "post" && (
                                  <DropdownMenuItem onClick={() => removeContent(r)} className="text-destructive">
                                    <Trash2 className="mr-2 h-4 w-4" /> Remove Content
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuItem onClick={() => dismiss(r)}>
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
          <DialogHeader>
            <DialogTitle>Review Report</DialogTitle>
          </DialogHeader>
          {reviewing && (
            <div className="space-y-4 py-1">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Type</p>
                  <Badge variant="outline" className={`capitalize text-xs ${typeColors[reviewing.target_type] || ""}`}>{reviewing.target_type}</Badge>
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
                <p className="text-sm font-medium">{reasonLabels[reviewing.reason] || reviewing.reason}</p>
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
                  <div className="text-sm bg-muted rounded-md p-3 border border-border">
                    {reviewing.content.text}
                  </div>
                </div>
              )}
            </div>
          )}
          {reviewing?.status === "pending" && (
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => dismiss(reviewing)}>
                <XCircle className="mr-2 h-4 w-4" /> Dismiss
              </Button>
              {reviewing.target_type === "post" && (
                <Button variant="destructive" onClick={() => removeContent(reviewing)} disabled={actioning}>
                  <Trash2 className="mr-2 h-4 w-4" /> {actioning ? "Removing…" : "Remove Content"}
                </Button>
              )}
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
