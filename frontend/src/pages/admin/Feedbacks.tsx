import { useState, useEffect, useCallback } from "react";
import { AdminLayout } from "./AdminLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Eye, ChevronLeft, ChevronRight, Star, MessageSquare } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiGet } from "@/api/client";

interface Feedback {
  id: string;
  category: string;
  rating: number;
  title: string;
  message: string;
  created_at: string;
  user_id: string;
  profiles: { name: string; avatar_url?: string; color?: string } | null;
}

const categoryColors: Record<string, string> = {
  bug:         "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  feature:     "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  improvement: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400",
  general:     "bg-muted text-muted-foreground",
  other:       "bg-muted text-muted-foreground",
};

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <Star
          key={i}
          className={`h-3.5 w-3.5 ${i <= rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"}`}
        />
      ))}
    </div>
  );
}

const PAGE_SIZE = 50;

export default function AdminFeedbacks() {
  const [items, setItems]           = useState<Feedback[]>([]);
  const [total, setTotal]           = useState(0);
  const [page, setPage]             = useState(1);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [ratingFilter, setRatingFilter]     = useState("all");
  const [loading, setLoading]       = useState(true);
  const [viewing, setViewing]       = useState<Feedback | null>(null);
  const { toast } = useToast();

  const fetchFeedback = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page) });
      const res = await apiGet<any>(`/api/admin/feedback?${params}`);
      let data: Feedback[] = res.data ?? res ?? [];
      // Client-side category/rating filter (small dataset, no need for server filter)
      if (categoryFilter !== "all") data = data.filter(f => f.category === categoryFilter);
      if (ratingFilter !== "all") data = data.filter(f => f.rating === Number(ratingFilter));
      setItems(data);
      setTotal(res.total ?? data.length);
    } catch (e: any) {
      toast({ title: "Failed to load feedback", description: e.message, variant: "destructive" });
    } finally { setLoading(false); }
  }, [page, categoryFilter, ratingFilter]);

  useEffect(() => { fetchFeedback(); }, [fetchFeedback]);
  useEffect(() => { setPage(1); }, [categoryFilter, ratingFilter]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  // Compute avg rating from loaded items
  const avgRating = items.length > 0
    ? (items.reduce((sum, f) => sum + f.rating, 0) / items.length).toFixed(1)
    : "—";

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Feedback</h1>
            <p className="text-muted-foreground text-sm mt-1">User-submitted feedback from the app</p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-36"><SelectValue placeholder="Category" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                <SelectItem value="bug">Bug</SelectItem>
                <SelectItem value="feature">Feature</SelectItem>
                <SelectItem value="improvement">Improvement</SelectItem>
                <SelectItem value="general">General</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
            <Select value={ratingFilter} onValueChange={setRatingFilter}>
              <SelectTrigger className="w-32"><SelectValue placeholder="Rating" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All ratings</SelectItem>
                {[5, 4, 3, 2, 1].map(r => (
                  <SelectItem key={r} value={String(r)}>{r} ★</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Summary strip */}
        <div className="grid grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-5 pb-4">
              <p className="text-xs text-muted-foreground mb-1">Total Submissions</p>
              <p className="text-2xl font-bold">{total}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5 pb-4">
              <p className="text-xs text-muted-foreground mb-1">Avg Rating</p>
              <div className="flex items-center gap-2">
                <p className="text-2xl font-bold">{avgRating}</p>
                <Star className="h-5 w-5 fill-amber-400 text-amber-400" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5 pb-4">
              <p className="text-xs text-muted-foreground mb-1">Showing</p>
              <p className="text-2xl font-bold">{items.length}</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardContent className="pt-6">
            {loading ? (
              <div className="space-y-3">{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-12 w-full rounded" />)}</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Rating</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Message</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="w-20 text-right">View</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-10">
                        <MessageSquare className="h-7 w-7 mx-auto mb-2 opacity-20" />
                        No feedback found
                      </TableCell>
                    </TableRow>
                  ) : items.map(f => (
                    <TableRow key={f.id}>
                      <TableCell className="text-sm font-medium">{f.profiles?.name ?? "Unknown"}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`capitalize text-xs ${categoryColors[f.category] ?? "bg-muted text-muted-foreground"}`}>
                          {f.category}
                        </Badge>
                      </TableCell>
                      <TableCell><StarRating rating={f.rating} /></TableCell>
                      <TableCell className="text-sm max-w-[180px]">
                        <span className="line-clamp-1 font-medium">{f.title}</span>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[200px]">
                        <span className="line-clamp-2">{f.message}</span>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {new Date(f.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="outline" size="sm" className="h-7 text-xs px-3" onClick={() => setViewing(f)}>
                          <Eye className="mr-1.5 h-3 w-3" /> View
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

      {/* Detail dialog */}
      <Dialog open={!!viewing} onOpenChange={open => !open && setViewing(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4" /> Feedback Detail
            </DialogTitle>
          </DialogHeader>
          {viewing && (
            <div className="space-y-4 py-1">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">From</p>
                  <p className="font-medium">{viewing.profiles?.name ?? "Unknown"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Date</p>
                  <p>{new Date(viewing.created_at).toLocaleDateString()}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Category</p>
                  <Badge variant="outline" className={`capitalize text-xs ${categoryColors[viewing.category] ?? ""}`}>
                    {viewing.category}
                  </Badge>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Rating</p>
                  <StarRating rating={viewing.rating} />
                </div>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Title</p>
                <p className="text-sm font-semibold">{viewing.title}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Message</p>
                <div className="bg-muted rounded-md p-3 text-sm whitespace-pre-wrap break-words max-h-48 overflow-y-auto">
                  {viewing.message}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
