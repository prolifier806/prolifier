import { useState, useEffect } from "react";
import { AdminLayout } from "./AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, FileText, Flag, ShieldAlert } from "lucide-react";
import { apiGet } from "@/api/client";

interface Stats {
  totalUsers: number; activeUsers: number; totalPosts: number;
  pendingReports: number; bannedUsers: number; suspendedUsers: number;
  totalReports: number;
}
interface Activity {
  id: string; action: string; created_at: string;
  admin: { name: string } | null; target: { name: string } | null;
}
interface Report {
  id: string; reason: string; target_type: string; created_at: string;
  reporter: { name: string } | null;
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      apiGet<Stats>("/api/admin/stats"),
      apiGet<any>("/api/admin/activity?page=1"),
      apiGet<any>("/api/admin/reports?status=pending&page=1"),
    ]).then(([s, a, r]) => {
      setStats(s);
      setActivity((a.data ?? a).slice(0, 5));
      setReports((r.data ?? r).slice(0, 5));
    }).finally(() => setLoading(false));
  }, []);

  const statCards = stats ? [
    { label: "Total Users",     value: stats.totalUsers,     icon: Users,      color: "text-blue-500" },
    { label: "Total Posts",     value: stats.totalPosts,     icon: FileText,   color: "text-emerald-500" },
    { label: "Pending Reports", value: stats.pendingReports, icon: Flag,       color: "text-amber-500" },
    { label: "Banned Users",    value: stats.bannedUsers,    icon: ShieldAlert, color: "text-red-500" },
  ] : [];

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="text-muted-foreground text-sm mt-1">Platform overview</p>
        </div>

        {loading ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[1,2,3,4].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {statCards.map(({ label, value, icon: Icon, color }) => (
              <Card key={label}>
                <CardContent className="p-5 flex items-center gap-4">
                  <div className={`p-2 rounded-lg bg-muted ${color}`}><Icon className="h-5 w-5" /></div>
                  <div>
                    <p className="text-2xl font-bold">{value.toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground">{label}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <div className="grid lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm font-medium">Recent Activity</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {loading ? [1,2,3].map(i => <Skeleton key={i} className="h-10 rounded" />) :
               activity.length === 0 ? <p className="text-sm text-muted-foreground text-center py-4">No activity yet</p> :
               activity.map(a => (
                <div key={a.id} className="flex items-center justify-between py-1.5 text-sm">
                  <span>
                    <span className="font-medium">{a.admin?.name ?? "Admin"}</span>
                    {" "}<span className="text-muted-foreground capitalize">{a.action}</span>{" "}
                    <span className="font-medium">{a.target?.name ?? "user"}</span>
                  </span>
                  <span className="text-xs text-muted-foreground">{timeAgo(a.created_at)}</span>
                </div>
               ))
              }
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm font-medium">Pending Reports</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {loading ? [1,2,3].map(i => <Skeleton key={i} className="h-10 rounded" />) :
               reports.length === 0 ? <p className="text-sm text-muted-foreground text-center py-4">No pending reports</p> :
               reports.map(r => (
                <div key={r.id} className="flex items-center justify-between py-1.5 text-sm">
                  <span>
                    <span className="font-medium capitalize">{r.target_type}</span>
                    {" "}<span className="text-muted-foreground">·</span>{" "}
                    <span className="text-muted-foreground">{r.reason}</span>
                  </span>
                  <span className="text-xs text-muted-foreground">{timeAgo(r.created_at)}</span>
                </div>
               ))
              }
            </CardContent>
          </Card>
        </div>
      </div>
    </AdminLayout>
  );
}
