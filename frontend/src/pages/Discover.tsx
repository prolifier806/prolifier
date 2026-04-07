import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, MapPin, UserPlus, Check, X, UserCheck, ShieldOff } from "lucide-react";
import Layout from "@/components/Layout";
import { toast } from "@/hooks/use-toast";
import { useUser } from "@/context/UserContext";
import { supabase } from "@/lib/supabase";
import { createNotification } from "@/api/notifications";
import { isAbortError } from "@/api/client";
import { useRealtimeChannel } from "@/hooks/useRealtimeChannel";
import {
  discoverProfiles,
  getProfile,
  blockUser,
  unblockUser,
} from "@/api/users";
import {
  getConnections,
  getPendingRequests,
  sendRequest,
  acceptRequest,
  declineRequest,
  removeConnection,
  markRequestsRead,
} from "@/api/connections";

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
  role?: string;
};

type Request = {
  requesterId: string;
  name: string;
  avatar: string;
  avatarUrl?: string;
  color: string;
  bio: string;
  project: string;
  location: string;
  createdAt: string;
};

function DiscoverSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {[1,2,3,4].map(i => (
        <div key={i} className="p-5 rounded-xl border border-border bg-card animate-pulse flex flex-col">
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
          <div className="flex justify-end mt-auto gap-2">
            <div className="h-8 bg-muted rounded-lg w-24" />
            <div className="h-8 bg-muted rounded-lg w-20" />
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
  const [activeTab, setActiveTab] = useState("discover");

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

  const [pending, setPending] = useState<Set<string>>(new Set());
  const [blockedByMe, setBlockedByMe] = useState<Set<string>>(new Set());

  const [requests, setRequests] = useState<Request[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [requestCount, setRequestCount] = useState(0);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [decliningId, setDecliningId] = useState<string | null>(null);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(debounceRef.current);
  }, [search]);

  const DISCOVER_CACHE_KEY = `prolifier:discover:${user.id}`;
  const DISCOVER_CACHE_TTL = 3 * 60 * 1000; // 3 minutes

  const mapProfiles = (data: any[]): Profile[] => data.map((p: any) => ({
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
    role: p.role || "user",
  }));

  const fetchProfiles = useCallback(async (cursor?: string) => {
    if (!user.id) return;

    // Show stale cache immediately on initial load (no cursor = first page)
    // WHY: Cache includes connected/pending/blocked so buttons render correctly
    // on first paint — no flash of wrong state while API loads.
    if (!cursor) {
      try {
        const raw = localStorage.getItem(DISCOVER_CACHE_KEY);
        if (raw) {
          const { ts, profiles: cp, connected: cc, pending: cp2, blocked: cb } = JSON.parse(raw);
          if (Date.now() - ts < DISCOVER_CACHE_TTL) {
            setProfiles(cp);
            if (cc) setConnected(new Set(cc));
            if (cp2) setPending(new Set(cp2));
            if (cb) setBlockedByMe(new Set(cb));
            setLoading(false);
          }
        }
      } catch { /* ignore */ }
    }

    cursor ? setLoadingMore(true) : setLoading(prev => prev);
    try {
      const params: Record<string, string> = {};
      if (cursor) params.cursor = cursor;
      if (debouncedSearch) params.search = debouncedSearch;
      if (collabOnly) params.collabOnly = "true";

      // On initial load: fire profiles + connections + blocks all in parallel
      if (!cursor) {
        const [data, conns, blocksRes] = await Promise.all([
          discoverProfiles(params),
          getConnections().catch(() => []),
          (supabase as any).from("blocks").select("blocked_id").eq("blocker_id", user.id),
        ]);

        const mapped = mapProfiles(data);
        setProfiles(mapped);
        setHasMore(data.length === PAGE_SIZE);
        if (data.length > 0) cursorRef.current = data[data.length - 1].created_at;

        const acceptedIds = new Set<string>();
        const pendingIds = new Set<string>();
        for (const c of conns) {
          const otherId = c.requester_id === user.id ? c.receiver_id : c.requester_id;
          if (c.status === "accepted") acceptedIds.add(otherId);
          else if (c.status === "pending" && c.requester_id === user.id) pendingIds.add(c.receiver_id);
        }
        const blockedSet = new Set<string>((blocksRes.data || []).map((b: any) => b.blocked_id as string));
        setConnected(acceptedIds);
        setPending(pendingIds);
        setBlockedByMe(blockedSet);

        // Cache profiles + connection state together so buttons show correctly on next visit
        try {
          localStorage.setItem(DISCOVER_CACHE_KEY, JSON.stringify({
            ts: Date.now(),
            profiles: data,
            connected: [...acceptedIds],
            pending: [...pendingIds],
            blocked: [...blockedSet],
          }));
        } catch { /* quota */ }
      } else {
        const data = await discoverProfiles(params);
        const mapped = mapProfiles(data);
        setProfiles(prev => [...prev, ...mapped]);
        setHasMore(data.length === PAGE_SIZE);
        if (data.length > 0) cursorRef.current = data[data.length - 1].created_at;
      }
    } catch (err: any) {
      if (isAbortError(err)) return;
      toast({ title: "Failed to load profiles", description: err.message, variant: "destructive" });
    } finally {
      cursor ? setLoadingMore(false) : setLoading(false);
    }
  }, [user.id, debouncedSearch, collabOnly]);

  useEffect(() => {
    if (!user.id) return;
    cursorRef.current = null;
    fetchProfiles();
  }, [user.id, debouncedSearch, collabOnly, fetchProfiles]);

  const fetchRequests = useCallback(async () => {
    if (!user.id) return;
    setRequestsLoading(true);
    try {
      const data = await getPendingRequests();
      const mapped: Request[] = data.map((r: any) => ({
        requesterId: r.requester_id,
        name: r.profiles?.name || "Unknown",
        avatar: r.profiles?.avatar || "?",
        avatarUrl: r.profiles?.avatar_url || undefined,
        color: r.profiles?.color || "bg-primary",
        bio: r.profiles?.bio || "",
        project: r.profiles?.project || "",
        location: r.profiles?.location || "",
        createdAt: r.created_at,
      }));
      setRequests(mapped);
    } catch (err: any) {
      if (isAbortError(err)) return;
      toast({ title: "Failed to load requests", description: err.message, variant: "destructive" });
    } finally {
      setRequestsLoading(false);
    }
  }, [user.id]);

  useEffect(() => {
    if (activeTab === "requests" && user.id) {
      fetchRequests();
      setRequestCount(0);
      window.dispatchEvent(new Event("prolifier:requests-opened"));
      markRequestsRead().catch(() => {});
    }
  }, [activeTab, user.id, fetchRequests]);

  // Fetch unread request count on mount
  useEffect(() => {
    if (!user.id) return;
    (supabase as any)
      .from("connections")
      .select("id", { count: "exact", head: true })
      .eq("receiver_id", user.id)
      .eq("status", "pending")
      .eq("read", false)
      .then(({ count }: any) => setRequestCount(count ?? 0));
  }, [user.id]);

  // Realtime: live connection status updates
  useRealtimeChannel(
    user.id ? `discover-conns-${user.id}` : null,
    ch => ch
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "connections" }, (payload) => {
        const row = payload.new as any;
        const involvesMe = row.requester_id === user.id || row.receiver_id === user.id;
        if (!involvesMe) return;
        const otherId = row.requester_id === user.id ? row.receiver_id : row.requester_id;
        if (row.status === "accepted") {
          setConnected(prev => new Set([...prev, otherId]));
          setPending(prev => { const n = new Set(prev); n.delete(otherId); return n; });
        }
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "connections" }, (payload) => {
        const row = payload.old as any;
        const involvesMe = row.requester_id === user.id || row.receiver_id === user.id;
        if (!involvesMe) return;
        const otherId = row.requester_id === user.id ? row.receiver_id : row.requester_id;
        setConnected(prev => { const n = new Set(prev); n.delete(otherId); return n; });
        setPending(prev => { const n = new Set(prev); n.delete(otherId); return n; });
      }),
  );

  const handleUnblock = async (id: string, name: string) => {
    try {
      await unblockUser(id);
      setBlockedByMe(prev => { const next = new Set(prev); next.delete(id); return next; });
      toast({ title: `${name} unblocked` });
    } catch (err: any) {
      if (!isAbortError(err)) toast({ title: "Failed to unblock", description: err.message, variant: "destructive" });
    }
  };

  const handleConnect = async (id: string, name: string) => {
    const isConnected = connected.has(id);
    const isPending = pending.has(id);

    if (isConnected) {
      setConnected(prev => { const n = new Set(prev); n.delete(id); return n; });
      try {
        await removeConnection(id);
        toast({ title: "Connection removed", description: `You disconnected from ${name}.` });
      } catch (err: any) {
        setConnected(prev => new Set([...prev, id]));
        if (!isAbortError(err)) toast({ title: "Failed to remove connection", description: err.message, variant: "destructive" });
      }
      return;
    }

    if (isPending) {
      setPending(prev => { const n = new Set(prev); n.delete(id); return n; });
      try {
        await removeConnection(id);
        toast({ title: "Request cancelled" });
      } catch (err: any) {
        setPending(prev => new Set([...prev, id]));
        if (!isAbortError(err)) toast({ title: "Failed to cancel request", description: err.message, variant: "destructive" });
      }
      return;
    }

    setPending(prev => new Set(prev).add(id));
    try {
      await sendRequest(id);
      toast({ title: "Connection request sent! 🤝", description: `${name} will be notified.` });
      createNotification({
        userId: id,
        type: "match",
        text: `${user.name} sent you a connection request`,
        subtext: user.bio?.slice(0, 60) || undefined,
        action: `profile:${user.id}`,
        actorId: user.id,
      });
    } catch (err: any) {
      setPending(prev => { const n = new Set(prev); n.delete(id); return n; });
      if (!isAbortError(err)) toast({ title: "Failed to send request", description: err.message, variant: "destructive" });
    }
  };

  const handleAccept = async (requesterId: string, name: string) => {
    setAcceptingId(requesterId);
    try {
      await acceptRequest(requesterId);
      setRequests(prev => prev.filter(r => r.requesterId !== requesterId));
      setRequestCount(prev => Math.max(0, prev - 1));
      setConnected(prev => new Set([...prev, requesterId]));
      setPending(prev => { const n = new Set(prev); n.delete(requesterId); return n; });
      toast({ title: `Connected with ${name}! 🎉` });
      createNotification({
        userId: requesterId,
        type: "match",
        text: `${user.name} accepted your connection request`,
        action: `profile:${user.id}`,
        actorId: user.id,
      });
    } catch (err: any) {
      if (!isAbortError(err)) toast({ title: "Failed to accept", description: err.message, variant: "destructive" });
    } finally {
      setAcceptingId(null);
    }
  };

  const handleDecline = async (requesterId: string, name: string) => {
    setDecliningId(requesterId);
    try {
      await declineRequest(requesterId);
      setRequests(prev => prev.filter(r => r.requesterId !== requesterId));
      setRequestCount(prev => Math.max(0, prev - 1));
      toast({ title: `Request from ${name} declined` });
    } catch (err: any) {
      if (!isAbortError(err)) toast({ title: "Failed to decline", description: err.message, variant: "destructive" });
    } finally {
      setDecliningId(null);
    }
  };

  const filtered = profiles;

  return (
    <Layout>
      <div className="max-w-3xl mx-auto px-4 py-6">
        <h1 className="font-display text-2xl font-bold mb-6">Discover</h1>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full mb-6">
            <TabsTrigger value="discover" className="flex-1">People</TabsTrigger>
            <TabsTrigger value="requests" className="flex-1">
              Requests
              {requestCount > 0 && (
                <span className="ml-1.5 h-4 min-w-4 px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold inline-flex items-center justify-center">
                  {requestCount}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          {/* ── Discover People ── */}
          <TabsContent value="discover" className="space-y-4">
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
                {filtered.map((p) => {
                  const isConnected = connected.has(p.id);
                  const isPending = pending.has(p.id);
                  const isBlockedByMe = blockedByMe.has(p.id);
                  return (
                    <div
                      key={p.id}
                      className="p-5 rounded-xl border border-border bg-card hover:shadow-md transition-shadow flex flex-col animate-in fade-in slide-in-from-bottom-2 duration-300"
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
                              className="inline-flex items-center gap-1 font-semibold text-foreground hover:underline text-left text-sm"
                            >
                              {p.name}
                              {p.role === "admin" && (
                                <span title="Verified" className="shrink-0 h-4 w-4 rounded-full bg-blue-500 inline-flex items-center justify-center">
                                  <Check className="h-2.5 w-2.5 text-white stroke-[3]" />
                                </span>
                              )}
                            </button>
                            <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border ${
                              p.openToCollab
                                ? "bg-emerald-500 text-white border-emerald-500"
                                : "bg-secondary text-muted-foreground border-border"
                            }`}>
                              <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${p.openToCollab ? "bg-white" : "bg-muted-foreground"}`}/>
                              {p.openToCollab ? "Open to collab" : "Not available"}
                            </span>
                          </div>
                          {p.location && (
                            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                              <MapPin className="h-3 w-3 shrink-0" /> {p.location}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex-1">
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
                      </div>

                      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border/50">
                        {isBlockedByMe ? (
                          <>
                            <span className="flex-1 text-xs text-muted-foreground font-medium flex items-center gap-1.5">
                              <ShieldOff className="h-3.5 w-3.5" /> Blocked
                            </span>
                            <Button
                              size="sm"
                              variant="outline"
                              className="flex-1 gap-1.5 text-xs h-9"
                              onClick={() => handleUnblock(p.id, p.name)}
                            >
                              Unblock
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              className="flex-1 gap-1.5 text-xs h-9"
                              onClick={() => navigate(`/profile/${p.id}`)}
                            >
                              View Profile
                            </Button>
                            <Button
                              size="sm"
                              variant={isConnected || isPending ? "outline" : "default"}
                              className={`flex-1 gap-1.5 text-xs h-9 ${isConnected ? "border-primary text-primary" : isPending ? "border-muted-foreground text-muted-foreground" : ""}`}
                              onClick={() => handleConnect(p.id, p.name)}
                            >
                              {isConnected
                                ? <><Check className="h-3.5 w-3.5" /> Connected</>
                                : isPending
                                  ? "Pending…"
                                  : <><UserPlus className="h-3.5 w-3.5" /> Connect</>}
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
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
          </TabsContent>

          {/* ── Requests ── */}
          <TabsContent value="requests">
            {requestsLoading ? (
              <div className="flex items-center justify-center py-16">
                <div className="h-6 w-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
              </div>
            ) : requests.length === 0 ? (
              <div className="text-center py-14 text-muted-foreground">
                <UserCheck className="h-10 w-10 mx-auto mb-3 opacity-25" />
                <p className="text-sm font-medium mb-1">No pending requests</p>
                <p className="text-xs">When someone sends you a connection request, it will appear here.</p>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground mb-2">{requests.length} pending request{requests.length !== 1 ? "s" : ""}</p>
                {requests.map((r) => (
                  <div
                    key={r.requesterId}
                    className="flex items-center gap-4 p-4 rounded-xl border border-border bg-card animate-in fade-in duration-200"
                  >
                    <button
                      onClick={() => navigate(`/profile/${r.requesterId}`)}
                      className={`h-12 w-12 rounded-full ${r.avatarUrl ? "" : r.color} flex items-center justify-center text-white font-semibold shrink-0 hover:opacity-80 transition-opacity overflow-hidden`}
                    >
                      {r.avatarUrl
                        ? <img src={r.avatarUrl} alt={r.avatar} className="w-full h-full object-cover" />
                        : r.avatar}
                    </button>

                    <div className="flex-1 min-w-0">
                      <button
                        onClick={() => navigate(`/profile/${r.requesterId}`)}
                        className="font-semibold text-sm text-foreground hover:underline text-left"
                      >
                        {r.name}
                      </button>
                      {r.location && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                          <MapPin className="h-3 w-3 shrink-0" /> {r.location}
                        </p>
                      )}
                      {r.bio && <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{r.bio}</p>}
                    </div>

                    <div className="flex flex-col gap-2 shrink-0">
                      <Button
                        size="sm"
                        className="h-8 px-4 text-xs gap-1.5"
                        disabled={acceptingId === r.requesterId}
                        onClick={() => handleAccept(r.requesterId, r.name)}
                      >
                        {acceptingId === r.requesterId
                          ? <div className="h-3 w-3 rounded-full border-2 border-primary-foreground border-t-transparent animate-spin" />
                          : <Check className="h-3.5 w-3.5" />}
                        Accept
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 px-4 text-xs gap-1.5"
                        disabled={decliningId === r.requesterId}
                        onClick={() => handleDecline(r.requesterId, r.name)}
                      >
                        {decliningId === r.requesterId
                          ? <div className="h-3 w-3 rounded-full border-2 border-muted-foreground border-t-transparent animate-spin" />
                          : <X className="h-3.5 w-3.5" />}
                        Decline
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
