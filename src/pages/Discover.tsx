import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Search, MapPin, UserPlus, Check } from "lucide-react";
import Layout from "@/components/Layout";
import { toast } from "@/hooks/use-toast";
import { useUser } from "@/context/UserContext";
import { supabase } from "@/lib/supabase";
import { createNotification } from "@/lib/notifications";


type Profile = {
  id: string;
  name: string;
  avatar: string;
  avatarUrl?: string;
  color: string;
  location: string;
  bio: string;
  project: string;
  skills: string[];
  openToCollab: boolean;
};

function DiscoverSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {[1,2,3,4].map(i => (
        <div key={i} className="p-5 rounded-xl border border-border bg-card animate-pulse">
          <div className="flex items-start gap-3 mb-3">
            <div className="h-12 w-12 rounded-full bg-muted shrink-0" />
            <div className="flex-1 space-y-2 pt-1">
              <div className="h-3 bg-muted rounded w-28" />
              <div className="h-2.5 bg-muted rounded w-20" />
            </div>
          </div>
          <div className="space-y-2 mb-3">
            <div className="h-2.5 bg-muted rounded w-full" />
            <div className="h-2.5 bg-muted rounded w-3/4" />
          </div>
          <div className="flex gap-2 mb-3">
            <div className="h-5 bg-muted rounded-full w-16" />
            <div className="h-5 bg-muted rounded-full w-14" />
            <div className="h-5 bg-muted rounded-full w-20" />
          </div>
          <div className="flex justify-end">
            <div className="h-7 bg-muted rounded-lg w-24" />
          </div>
        </div>
      ))}
    </div>
  );
}

const PAGE_SIZE = 20;

export default function Discover() {
  const { user } = useUser();
  const navigate = useNavigate();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [connected, setConnected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [collabOnly, setCollabOnly] = useState(false);
  const cursorRef = useRef<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Debounce search — only fires server query 300 ms after the user stops typing
  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(debounceRef.current);
  }, [search]);

  const fetchProfiles = useCallback(async (cursor?: string) => {
    if (!user.id) return;
    cursor ? setLoadingMore(true) : setLoading(true);
    try {
      let query = (supabase as any)
        .from("profiles")
        .select("id, name, avatar, avatar_url, color, location, bio, project, skills, open_to_collab, created_at")
        .neq("id", user.id)
        .not("name", "eq", "")
        .order("created_at", { ascending: false })
        .limit(PAGE_SIZE);

      // Server-side text search on name, bio, project, location
      if (debouncedSearch) {
        const q = `%${debouncedSearch}%`;
        query = query.or(
          `name.ilike.${q},bio.ilike.${q},project.ilike.${q},location.ilike.${q}`
        );
      }
      // Server-side collab filter
      if (collabOnly) query = query.eq("open_to_collab", true);
      // Cursor for pagination
      if (cursor) query = query.lt("created_at", cursor);

      const { data, error } = await query;
      if (error) throw error;

      const mapped: Profile[] = (data || []).map((p: any) => ({
        id: p.id,
        name: p.name || "Unknown",
        avatar: p.avatar || "?",
        avatarUrl: p.avatar_url || undefined,
        color: p.color || "bg-primary",
        location: p.location || "",
        bio: p.bio || "",
        project: p.project || "",
        skills: p.skills || [],
        openToCollab: p.open_to_collab ?? true,
      }));

      cursor ? setProfiles(prev => [...prev, ...mapped]) : setProfiles(mapped);
      setHasMore((data || []).length === PAGE_SIZE);
      if ((data || []).length > 0) cursorRef.current = data[data.length - 1].created_at;

      // Fetch connections only on first load (not on paginate)
      if (!cursor) {
        const { data: conns } = await (supabase as any)
          .from("connections").select("receiver_id").eq("requester_id", user.id);
        if (conns) setConnected(new Set(conns.map((c: any) => c.receiver_id)));
      }
    } catch (err: any) {
      toast({ title: "Failed to load profiles", description: err.message, variant: "destructive" });
    } finally {
      cursor ? setLoadingMore(false) : setLoading(false);
    }
  }, [user.id, debouncedSearch, collabOnly]);

  // Re-fetch from scratch whenever search or filter changes
  useEffect(() => {
    if (!user.id) return;
    cursorRef.current = null;
    fetchProfiles();
  }, [user.id, debouncedSearch, collabOnly, fetchProfiles]);

  const handleConnect = async (id: string, name: string) => {
    const isConnected = connected.has(id);

    // Optimistic update
    setConnected(prev => {
      const next = new Set(prev);
      isConnected ? next.delete(id) : next.add(id);
      return next;
    });

    if (isConnected) {
      await (supabase as any)
        .from("connections")
        .delete()
        .eq("requester_id", user.id)
        .eq("receiver_id", id);
      toast({ title: "Connection removed", description: `You disconnected from ${name}.` });
    } else {
      await (supabase as any)
        .from("connections")
        .insert({ requester_id: user.id, receiver_id: id, status: "pending" });
      toast({ title: "Connection request sent! 🤝", description: `${name} will be notified.` });
      createNotification({
        userId: id,
        type: "match",
        text: `${user.name} sent you a connection request`,
        subtext: user.bio?.slice(0, 60) || undefined,
        action: `profile:${user.id}`,
      });
    }
  };

  // Server already filters by name/bio/project/location (ilike) and collabOnly.
  // No client-side filtering needed — pagination requires all filtering to be server-side.
  const filtered = profiles;

  return (
    <Layout>
      <div className="max-w-3xl mx-auto px-4 py-6">
        <h1 className="font-display text-2xl font-bold mb-6">Discover Builders</h1>

        <div className="flex gap-3 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, skill, project..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-10 h-11"
            />
          </div>
        </div>

        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Switch checked={collabOnly} onCheckedChange={setCollabOnly} />
            <span className="text-sm text-muted-foreground">Open to collaborate only</span>
          </div>
          <span className="text-xs text-muted-foreground">
            {loading ? "Loading..." : `${filtered.length} builder${filtered.length !== 1 ? "s" : ""}${hasMore ? "+" : ""}`}
          </span>
        </div>

        {loading ? (
          <DiscoverSkeleton />
        ) : filtered.length === 0 ? (
          <div className="text-center py-14 text-muted-foreground">
            <p className="text-sm font-medium mb-1">
              {profiles.length === 0 ? "No other builders yet" : "No builders found"}
            </p>
            <p className="text-xs mb-3">
              {profiles.length === 0
                ? "Invite friends to join Prolifier!"
                : "Try adjusting your search or filters."}
            </p>
            {(debouncedSearch || collabOnly) && (
              <button className="text-xs text-primary hover:underline"
                onClick={() => { setSearch(""); setCollabOnly(false); }}>
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {filtered.map((p, i) => {
              const isConnected = connected.has(p.id);
              return (
                <motion.div
                  key={p.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                  className="p-5 rounded-xl border border-border bg-card hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start gap-3 mb-3">
                    <button
                      onClick={() => navigate(`/profile/${p.id}`)}
                      className={`h-12 w-12 rounded-full ${p.avatarUrl ? "" : p.color} flex items-center justify-center text-white font-semibold shrink-0 hover:opacity-80 transition-opacity overflow-hidden`}
                    >
                      {p.avatarUrl
                        ? <img src={p.avatarUrl} alt={p.avatar} className="w-full h-full object-cover" />
                        : p.avatar}
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          onClick={() => navigate(`/profile/${p.id}`)}
                          className="font-semibold text-foreground hover:underline text-left text-sm"
                        >
                          {p.name}
                        </button>
                        {p.openToCollab && (
                          <span className="inline-flex items-center gap-1 text-xs text-emerald-600 font-medium">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 inline-block" />
                            Open to collab
                          </span>
                        )}
                      </div>
                      {p.location && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                          <MapPin className="h-3 w-3 shrink-0" /> {p.location}
                        </p>
                      )}
                    </div>
                  </div>

                  {p.bio && <p className="text-sm text-foreground mb-2 leading-relaxed line-clamp-2">{p.bio}</p>}
                  {p.project && (
                    <p className="text-xs text-muted-foreground mb-2">
                      Building: <span className="text-primary font-medium">{p.project}</span>
                    </p>
                  )}

                  {p.skills.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {p.skills.slice(0, 4).map(s => (
                        <Badge key={s} variant="outline" className="text-xs">{s}</Badge>
                      ))}
                      {p.skills.length > 4 && (
                        <Badge variant="outline" className="text-xs text-muted-foreground">+{p.skills.length - 4}</Badge>
                      )}
                    </div>
                  )}

                  <div className="flex items-center gap-2 justify-end">
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5 text-xs h-7 px-3"
                      onClick={() => navigate(`/profile/${p.id}`)}
                    >
                      View profile
                    </Button>
                    <Button
                      size="sm"
                      variant={isConnected ? "outline" : "default"}
                      className={`gap-1.5 text-xs h-7 px-3 ${isConnected ? "border-primary text-primary" : ""}`}
                      onClick={() => handleConnect(p.id, p.name)}
                    >
                      {isConnected ? <Check className="h-3 w-3" /> : <UserPlus className="h-3 w-3" />}
                      {isConnected ? "Connected" : "Connect"}
                    </Button>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}

        {hasMore && !loading && (
          <div className="flex justify-center pt-2">
            <Button
              variant="outline"
              onClick={() => fetchProfiles(cursorRef.current!)}
              disabled={loadingMore}
              className="gap-2"
            >
              {loadingMore
                ? <><div className="h-3.5 w-3.5 rounded-full border-2 border-primary border-t-transparent animate-spin" /> Loading…</>
                : "Load more"}
            </Button>
          </div>
        )}
      </div>
    </Layout>
  );
}