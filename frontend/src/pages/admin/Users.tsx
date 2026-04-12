import { useState, useEffect, useCallback } from "react";
import { AdminLayout } from "./AdminLayout";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, MoreHorizontal, Ban, ShieldOff, ShieldCheck, Clock, AlertTriangle, ChevronLeft, ChevronRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiGet, apiPatch } from "@/api/client";

interface User {
  id: string; name: string; avatar: string; color: string;
  role: string; account_status: string; suspended_until: string | null;
  created_at: string; postsCount: number; reportsCount: number;
}

type SuspendDuration = "1h" | "24h" | "3d" | "7d" | "30d" | "custom";
const durationLabels: Record<SuspendDuration, string> = { "1h": "1 Hour", "24h": "24 Hours", "3d": "3 Days", "7d": "7 Days", "30d": "30 Days", custom: "Custom" };
const durationMs: Record<string, number> = { "1h": 3600000, "24h": 86400000, "3d": 259200000, "7d": 604800000, "30d": 2592000000 };

function formatSuspendUntil(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (d < new Date()) return "Expired";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

const statusColors: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  suspended: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  banned: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

export default function AdminUsers() {
  const [users, setUsers]   = useState<User[]>([]);
  const [total, setTotal]   = useState(0);
  const [page, setPage]     = useState(1);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const [suspendTarget, setSuspendTarget]   = useState<User | null>(null);
  const [suspendDuration, setSuspendDuration] = useState<SuspendDuration>("24h");
  const [customDate, setCustomDate]         = useState("");
  const [suspending, setSuspending]         = useState(false);

  const [banTarget, setBanTarget] = useState<User | null>(null);
  const [banReason, setBanReason] = useState("");
  const [banning, setBanning]     = useState(false);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiGet<any>(`/api/admin/users?page=${page}&search=${encodeURIComponent(search)}`);
      setUsers(res.data ?? res);
      setTotal(res.total ?? 0);
    } catch (e: any) {
      toast({ title: "Failed to load users", description: e.message, variant: "destructive" });
    } finally { setLoading(false); }
  }, [page, search]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);
  useEffect(() => { setPage(1); }, [search]);

  const suspendUser = async () => {
    if (!suspendTarget) return;
    setSuspending(true);
    try {
      let durationDays: number;
      if (suspendDuration === "custom" && customDate) {
        durationDays = Math.ceil((new Date(customDate).getTime() - Date.now()) / 86400000);
      } else {
        durationDays = durationMs[suspendDuration] / 86400000;
      }
      await apiPatch(`/api/admin/users/${suspendTarget.id}/status`, { status: "suspended", durationDays });
      toast({ title: "User Suspended", description: `${suspendTarget.name} has been suspended.` });
      setSuspendTarget(null); setSuspendDuration("24h"); setCustomDate("");
      fetchUsers();
    } catch (e: any) {
      toast({ title: "Failed to suspend", description: e.message, variant: "destructive" });
    } finally { setSuspending(false); }
  };

  const banUser = async () => {
    if (!banTarget || !banReason.trim()) return;
    setBanning(true);
    try {
      await apiPatch(`/api/admin/users/${banTarget.id}/status`, { status: "banned", reason: banReason.trim() });
      toast({ title: "User Banned", description: `${banTarget.name} has been permanently banned.`, variant: "destructive" });
      setBanTarget(null); setBanReason("");
      fetchUsers();
    } catch (e: any) {
      toast({ title: "Failed to ban", description: e.message, variant: "destructive" });
    } finally { setBanning(false); }
  };

  const activateUser = async (user: User) => {
    try {
      await apiPatch(`/api/admin/users/${user.id}/status`, { status: "active" });
      toast({ title: user.account_status === "banned" ? "User Unbanned" : "Suspension Removed", description: `${user.name} has been reactivated.` });
      fetchUsers();
    } catch (e: any) {
      toast({ title: "Failed to reactivate", description: e.message, variant: "destructive" });
    }
  };

  const totalPages = Math.ceil(total / 25);

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Users</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage user accounts, suspensions, and bans</p>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-4">
              <div className="relative max-w-sm flex-1">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search users..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
              </div>
              <span className="text-xs text-muted-foreground whitespace-nowrap">{total} user{total !== 1 ? "s" : ""}</span>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-12 w-full rounded" />)}</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Details</TableHead>
                    <TableHead>Posts</TableHead>
                    <TableHead>Reports</TableHead>
                    <TableHead>Joined</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.length === 0 ? (
                    <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No users found</TableCell></TableRow>
                  ) : users.map(user => (
                    <TableRow key={user.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8">
                            <AvatarFallback className={`text-xs text-white ${user.color || "bg-primary"}`}>{user.avatar || "?"}</AvatarFallback>
                          </Avatar>
                          <p className="font-medium text-sm">{user.name}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize text-xs">{user.role}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`capitalize text-xs ${statusColors[user.account_status] || ""}`}>{user.account_status}</Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[200px]">
                        {user.account_status === "suspended" && user.suspended_until ? (
                          <span className="flex items-center gap-1 text-amber-600">
                            <Clock className="h-3 w-3" /> Until {formatSuspendUntil(user.suspended_until)}
                          </span>
                        ) : "—"}
                      </TableCell>
                      <TableCell className="text-sm">{user.postsCount}</TableCell>
                      <TableCell className="text-sm">{user.reportsCount}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{new Date(user.created_at).toLocaleDateString()}</TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {user.account_status !== "active" && (
                              <DropdownMenuItem onClick={() => activateUser(user)}>
                                <ShieldCheck className="mr-2 h-4 w-4" />
                                {user.account_status === "banned" ? "Unban User" : "Remove Suspension"}
                              </DropdownMenuItem>
                            )}
                            {user.account_status !== "banned" && (
                              <DropdownMenuItem onClick={() => setSuspendTarget(user)}>
                                <ShieldOff className="mr-2 h-4 w-4" />
                                {user.account_status === "suspended" ? "Change Suspension" : "Suspend User"}
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            {user.account_status !== "banned" && (
                              <DropdownMenuItem onClick={() => setBanTarget(user)} className="text-destructive">
                                <Ban className="mr-2 h-4 w-4" /> Ban Permanently
                              </DropdownMenuItem>
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

      {/* Suspend Dialog */}
      <Dialog open={!!suspendTarget} onOpenChange={open => !open && setSuspendTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><ShieldOff className="h-5 w-5 text-amber-500" /> Suspend {suspendTarget?.name}</DialogTitle>
            <DialogDescription>Suspended users cannot post, message, or interact with content.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Duration</Label>
              <Select value={suspendDuration} onValueChange={v => setSuspendDuration(v as SuspendDuration)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(durationLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {suspendDuration === "custom" && (
              <div className="space-y-2">
                <Label>Suspend Until</Label>
                <Input type="datetime-local" value={customDate} onChange={e => setCustomDate(e.target.value)} />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSuspendTarget(null)}>Cancel</Button>
            <Button className="bg-amber-500 hover:bg-amber-600 text-white" onClick={suspendUser} disabled={suspending || (suspendDuration === "custom" && !customDate)}>
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
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Reason <span className="text-destructive">*</span></Label>
              <Textarea placeholder="Reason for banning this user..." value={banReason} onChange={e => setBanReason(e.target.value)} rows={3} />
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
