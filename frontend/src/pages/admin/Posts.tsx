import { useState, useEffect, useCallback } from "react";
import { AdminLayout } from "./AdminLayout";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, MoreHorizontal, Trash2, ChevronLeft, ChevronRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiGet, apiDelete } from "@/api/client";

interface Post {
  id: string; content: string; tag: string; createdAt: string;
  author: string; authorAvatar: string; reportsCount: number; status: string;
}

export default function AdminPosts() {
  const [posts, setPosts]   = useState<Post[]>([]);
  const [total, setTotal]   = useState(0);
  const [page, setPage]     = useState(1);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchPosts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiGet<any>(`/api/admin/posts?page=${page}&search=${encodeURIComponent(search)}`);
      setPosts(res.data ?? res);
      setTotal(res.total ?? 0);
    } catch (e: any) {
      toast({ title: "Failed to load posts", description: e.message, variant: "destructive" });
    } finally { setLoading(false); }
  }, [page, search]);

  useEffect(() => { fetchPosts(); }, [fetchPosts]);
  useEffect(() => { setPage(1); }, [search]);

  const deletePost = async (id: string) => {
    try {
      await apiDelete(`/api/admin/content/posts/${id}`);
      setPosts(prev => prev.filter(p => p.id !== id));
      setTotal(t => t - 1);
      toast({ title: "Post deleted" });
    } catch (e: any) {
      toast({ title: "Failed to delete", description: e.message, variant: "destructive" });
    }
  };

  const totalPages = Math.ceil(total / 25);

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Posts</h1>
          <p className="text-muted-foreground text-sm mt-1">Review and moderate content</p>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-4">
              <div className="relative max-w-sm flex-1">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search posts..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
              </div>
              <span className="text-xs text-muted-foreground whitespace-nowrap">{total} post{total !== 1 ? "s" : ""}</span>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-12 w-full rounded" />)}</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Content</TableHead>
                    <TableHead>Author</TableHead>
                    <TableHead>Tag</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Reports</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {posts.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No posts found</TableCell></TableRow>
                  ) : posts.map(post => (
                    <TableRow key={post.id}>
                      <TableCell className="font-medium text-sm max-w-xs"><p className="truncate">{post.content}</p></TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Avatar className="h-6 w-6">
                            <AvatarFallback className="text-[10px] bg-secondary">{post.authorAvatar}</AvatarFallback>
                          </Avatar>
                          <span className="text-sm">{post.author}</span>
                        </div>
                      </TableCell>
                      <TableCell><Badge variant="outline" className="text-xs capitalize">{post.tag || "—"}</Badge></TableCell>
                      <TableCell><Badge variant="outline" className="text-xs capitalize">{post.status}</Badge></TableCell>
                      <TableCell className="text-sm">{post.reportsCount}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{new Date(post.createdAt).toLocaleDateString()}</TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => deletePost(post.id)} className="text-destructive">
                              <Trash2 className="mr-2 h-4 w-4" /> Delete Post
                            </DropdownMenuItem>
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
    </AdminLayout>
  );
}
