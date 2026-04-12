import { useState, useEffect } from "react";
import { AdminLayout } from "./AdminLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Trash2, Send, Archive } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiGet, apiPost, apiPatch, apiDelete } from "@/api/client";

interface Notice {
  id: string; title: string; content: string;
  priority: "low" | "medium" | "high" | "urgent";
  status: "draft" | "published" | "archived";
  created_at: string; published_at: string | null;
}

const priorityColors: Record<string, string> = {
  low:    "bg-muted text-muted-foreground",
  medium: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  high:   "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  urgent: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};
const statusColors: Record<string, string> = {
  draft:     "bg-muted text-muted-foreground",
  published: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  archived:  "bg-secondary text-secondary-foreground",
};

export default function AdminNotices() {
  const [notices, setNotices]         = useState<Notice[]>([]);
  const [loading, setLoading]         = useState(true);
  const [open, setOpen]               = useState(false);
  const [saving, setSaving]           = useState(false);
  const [newTitle, setNewTitle]       = useState("");
  const [newContent, setNewContent]   = useState("");
  const [newPriority, setNewPriority] = useState<Notice["priority"]>("medium");
  const { toast } = useToast();

  const fetchNotices = async () => {
    try {
      const res = await apiGet<any>("/api/admin/notices");
      setNotices(res.data ?? res);
    } catch (e: any) {
      toast({ title: "Failed to load notices", description: e.message, variant: "destructive" });
    } finally { setLoading(false); }
  };

  useEffect(() => { fetchNotices(); }, []);

  const addNotice = async () => {
    if (!newTitle.trim() || !newContent.trim()) return;
    setSaving(true);
    try {
      const notice = await apiPost<Notice>("/api/admin/notices", {
        title: newTitle.trim(), content: newContent.trim(), priority: newPriority,
      });
      setNotices(prev => [notice, ...prev]);
      setNewTitle(""); setNewContent(""); setNewPriority("medium");
      setOpen(false);
      toast({ title: "Notice created", description: "Saved as draft." });
    } catch (e: any) {
      toast({ title: "Failed to create", description: e.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  const updateStatus = async (id: string, status: Notice["status"]) => {
    try {
      const updated = await apiPatch<Notice>(`/api/admin/notices/${id}`, { status });
      setNotices(prev => prev.map(n => n.id === id ? updated : n));
      toast({ title: status === "published" ? "Notice published" : "Notice archived" });
    } catch (e: any) {
      toast({ title: "Failed to update", description: e.message, variant: "destructive" });
    }
  };

  const removeNotice = async (id: string) => {
    try {
      await apiDelete(`/api/admin/notices/${id}`);
      setNotices(prev => prev.filter(n => n.id !== id));
      toast({ title: "Notice deleted" });
    } catch (e: any) {
      toast({ title: "Failed to delete", description: e.message, variant: "destructive" });
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Notices</h1>
            <p className="text-muted-foreground text-sm mt-1">Create and manage platform announcements</p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="mr-2 h-4 w-4" /> New Notice</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Create Notice</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Title</Label>
                  <Input placeholder="Notice title" value={newTitle} onChange={e => setNewTitle(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Content</Label>
                  <Textarea placeholder="Notice content..." rows={4} value={newContent} onChange={e => setNewContent(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Priority</Label>
                  <Select value={newPriority} onValueChange={v => setNewPriority(v as Notice["priority"])}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="urgent">Urgent</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={addNotice} className="w-full" disabled={saving || !newTitle.trim() || !newContent.trim()}>
                  {saving ? "Creating…" : "Create Notice"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {loading ? (
          <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}</div>
        ) : notices.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <p className="text-sm">No notices yet. Create one to get started.</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {notices.map(notice => (
              <Card key={notice.id}>
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <h3 className="font-medium">{notice.title}</h3>
                        <Badge variant="outline" className={`text-xs capitalize ${priorityColors[notice.priority] || ""}`}>{notice.priority}</Badge>
                        <Badge variant="outline" className={`text-xs capitalize ${statusColors[notice.status] || ""}`}>{notice.status}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{notice.content}</p>
                      <p className="text-xs text-muted-foreground mt-2">
                        Created {new Date(notice.created_at).toLocaleDateString()}
                        {notice.published_at && ` · Published ${new Date(notice.published_at).toLocaleDateString()}`}
                      </p>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      {notice.status === "draft" && (
                        <Button variant="ghost" size="icon" className="h-8 w-8" title="Publish" onClick={() => updateStatus(notice.id, "published")}>
                          <Send className="h-4 w-4" />
                        </Button>
                      )}
                      {notice.status === "published" && (
                        <Button variant="ghost" size="icon" className="h-8 w-8" title="Archive" onClick={() => updateStatus(notice.id, "archived")}>
                          <Archive className="h-4 w-4" />
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" title="Delete" onClick={() => removeNotice(notice.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
