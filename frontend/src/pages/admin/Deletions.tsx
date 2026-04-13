import { useEffect, useState } from "react";
import { AdminLayout } from "./AdminLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { apiGet, apiPatch } from "@/api/client";
import { toast } from "@/hooks/use-toast";
import { Trash2, RotateCcw, Clock } from "lucide-react";

type PendingUser = {
  id: string;
  name: string;
  email: string;
  deleted_at: string;
  avatar: string | null;
  avatar_url: string | null;
  role: string;
};

function daysRemaining(deletedAt: string): number {
  const elapsed = Date.now() - new Date(deletedAt).getTime();
  return Math.max(0, 7 - Math.floor(elapsed / (1000 * 60 * 60 * 24)));
}

export default function Deletions() {
  const [users, setUsers] = useState<PendingUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [recovering, setRecovering] = useState<string | null>(null);

  useEffect(() => {
    apiGet<PendingUser[]>("/api/admin/deletions")
      .then(data => setUsers(data ?? []))
      .catch(() => toast({ title: "Failed to load", variant: "destructive" }))
      .finally(() => setLoading(false));
  }, []);

  const handleCancel = async (id: string) => {
    setRecovering(id);
    try {
      await apiPatch(`/api/admin/deletions/${id}/cancel`, {});
      setUsers(prev => prev.filter(u => u.id !== id));
      toast({ title: "Account deletion cancelled", description: "User account restored." });
    } catch {
      toast({ title: "Failed to cancel deletion", variant: "destructive" });
    }
    setRecovering(null);
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Pending Deletions</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Accounts scheduled for permanent deletion after 7-day cooldown
          </p>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="h-6 w-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          </div>
        ) : users.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Trash2 className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No accounts pending deletion</p>
          </div>
        ) : (
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">User</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Email</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Deleted At</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Time Left</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {users.map(u => {
                  const days = daysRemaining(u.deleted_at);
                  const expired = days === 0;
                  return (
                    <tr key={u.id} className="bg-card hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-medium">{u.name || "—"}</div>
                        <div className="text-xs text-muted-foreground capitalize">{u.role}</div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{u.email || "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {new Date(u.deleted_at).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3">
                        {expired ? (
                          <Badge variant="destructive" className="gap-1">
                            <Trash2 className="h-3 w-3" /> Expired
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="gap-1 text-amber-600 border-amber-500">
                            <Clock className="h-3 w-3" /> {days}d left
                          </Badge>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {!expired && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1.5"
                            disabled={recovering === u.id}
                            onClick={() => handleCancel(u.id)}
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                            {recovering === u.id ? "Restoring…" : "Restore"}
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
