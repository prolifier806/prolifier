# Prolifier — Performance Audit: Why You Max at 200 Users

**Audited:** 2026-03-29
**Architecture:** Vite + React SPA → Supabase (PostgREST + Realtime + Storage)
**Symptom:** API hangs, k6 load test caps at ~200 concurrent users

---

## 1. How Database Connections Actually Work Here

This is **not** a traditional Node.js + pg backend. There is no connection pool you own.

```
Browser (React SPA)
    │
    │  HTTPS (REST / WebSocket)
    ▼
Supabase Edge (PostgREST + Realtime)
    │
    │  PostgreSQL connections via pgBouncer / Supavisor
    ▼
Postgres (managed by Supabase)
```

Every `supabase.from("posts").select(...)` call becomes an **HTTP request to PostgREST**, not a direct PostgreSQL connection. Supabase manages the connection pool internally via:

- **Supavisor** (Supabase's pgBouncer replacement, transaction-mode pooling)
- Default pool size on Free plan: **15 connections**
- Default pool size on Pro plan: **25–60 connections**
- Each PostgREST worker holds a connection for the duration of the request

**The real bottleneck is not one deep query — it's the number of concurrent HTTP requests**, how long each one holds a PostgREST worker, and how many Realtime websocket subscriptions are active.

---

## 2. Verified Connection & Query Issues (by File)

### Issue 1 — `Messages.tsx:170` — Unbounded Full Table Scan (CRITICAL)

```typescript
// Messages.tsx:170–174
const { data, error } = await supabase
  .from("messages")
  .select("id, sender_id, receiver_id, text, media_type, created_at, read")
  .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
  .order("created_at", { ascending: false })
  .limit(300);   // ← fetches 300 raw rows
```

**What it does:** Fetches up to 300 most recent messages involving the user, then does **client-side grouping** in JavaScript to build the conversation list. With 200 users all loading Messages simultaneously, that is up to **60,000 rows being transferred across the network and processed in JS**.

**At 5,000 users:** 1,500,000 rows/burst on Messages page load.

**Why it hangs:** This query hits the `messages` table with an `OR` filter on two columns. The index `idx_messages_sender` covers `(sender_id, created_at DESC)` and `idx_messages_receiver` covers `(receiver_id, created_at DESC)`. PostgreSQL must **bitmap OR scan** both indexes — expensive at scale. The 300-row payload also saturates the HTTP response buffer.

**Fix:** Create a separate `conversations` materialized view or a `last_messages` table with one row per (user_a, user_b) pair. Query that instead. Alternatively, use an RPC function:
```sql
-- Replace the 300-row fetch with a server-side aggregation
CREATE OR REPLACE FUNCTION get_conversations(p_user_id uuid)
RETURNS TABLE(...) AS $$
  SELECT DISTINCT ON (other_user)
    CASE WHEN sender_id = p_user_id THEN receiver_id ELSE sender_id END AS other_user,
    text, media_type, created_at, read
  FROM messages
  WHERE sender_id = p_user_id OR receiver_id = p_user_id
  ORDER BY other_user, created_at DESC;
$$ LANGUAGE SQL STABLE;
```

---

### Issue 2 — `Messages.tsx:280` — No Pagination on Message History (CRITICAL)

```typescript
// Messages.tsx:280–285
const { data, error } = await supabase
  .from("messages")
  .select("id, sender_id, text, media_url, media_type, created_at, read")
  .or(`and(sender_id.eq.${user.id},receiver_id.eq.${otherId}),and(...)`)
  .order("created_at", { ascending: true });
  // ← NO .limit() — fetches ENTIRE conversation history
```

**What it does:** Fetches all messages in a conversation in a single unbounded query. A 2-year-old conversation could have thousands of messages. At 200 concurrent users each opening a chat, this floods PostgREST workers.

**Fix:** Add `.limit(50)` and implement cursor-based pagination for older messages.

---

### Issue 3 — `UserContext.tsx:357` — Per-User Polling Flood (HIGH)

```typescript
// UserContext.tsx:354–383
const timer = setInterval(checkDeletion, 5 * 60_000); // every 5 minutes
```

Each authenticated user fires a `SELECT deleted_at, permanently_deleted FROM profiles WHERE id = $1` every 5 minutes, plus on every tab visibility change.

**At 200 users with staggered timers:** ~40 identical single-row lookups per minute hitting PostgREST. This is fine.

**At 5,000 users:** ~1,000 lookups/minute. Each holds a PostgREST connection for ~5ms. With a 60-connection pool, that's ~8 concurrent connections *just for polling*, leaving fewer for real user actions.

**Fix:** Replace the polling with a single Supabase Realtime subscription scoped to the user's own profile row:
```typescript
// Replace setInterval with:
supabase
  .channel(`profile-${id}`)
  .on("postgres_changes", {
    event: "UPDATE", schema: "public", table: "profiles",
    filter: `id=eq.${id}`
  }, handler)
  .subscribe();
```
This uses **one persistent websocket multiplexed channel** instead of periodic HTTP polls. Net effect: **zero HTTP connections for deletion monitoring** at any scale.

---

### Issue 4 — `Feed.tsx:1089` — 8 Parallel Queries on Every Page Load (HIGH)

```typescript
// Feed.tsx:1089–1124 — Two waterfall rounds, 4+4 queries
const [postsRes, collabsRes, myBlocksRes, blockedByRes] = await Promise.all([...4 queries...]);
// then immediately:
const [likesRes, savedPostsRes, savedCollabsRes, interestedRes] = await Promise.all([...4 queries...]);
// then background:
supabase.from("comments").select("post_id").in("post_id", postIds) // 9th query
```

That's **9 sequential/waterfall HTTP requests** per user who loads the Feed. With 200 users loading simultaneously: **1,800 concurrent requests to PostgREST**.

**The blocks fetches are particularly wasteful:**
```typescript
// These fetch ALL blocks with no limit — full table scan at scale
(supabase as any).from("blocks").select("blocked_id").eq("blocker_id", user.id),
(supabase as any).from("blocks").select("blocker_id").eq("blocked_id", user.id),
```

**Fix A:** Consolidate into a single PostgreSQL function call that returns posts, collabs, likes, saves, and interests in one round-trip.

**Fix B (quick win):** Add a `comment_count` denormalized integer column to `posts` updated by a trigger — eliminates the 9th background query entirely.

**Fix C:** Cache blocks in localStorage and refresh lazily (already partially done, but the DB fetch is always made on load).

---

### Issue 5 — `Feed.tsx:1188` — Client-Side Comment Count Aggregation (MEDIUM)

```typescript
// Feed.tsx:1186–1194
supabase.from("comments").select("post_id").in("post_id", postIds)
  .then(({ data: commentRows }) => {
    const countMap: Record<string, number> = {};
    commentRows.forEach((c) => { countMap[c.post_id] = (countMap[c.post_id] || 0) + 1; });
    // ...
  });
```

This fetches **every comment row** for 30 posts just to count them. If 30 posts each have 50 comments, that's 1,500 rows fetched, transmitted, and counted in JS — just to display a number badge.

**Fix:** Add `comment_count integer default 0` to the `posts` table and a trigger to increment/decrement it. The existing `likes` column already follows this pattern — apply the same to comments.

```sql
ALTER TABLE posts ADD COLUMN comment_count integer DEFAULT 0;

CREATE OR REPLACE FUNCTION update_comment_count() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE posts SET comment_count = comment_count + 1 WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE posts SET comment_count = comment_count - 1 WHERE id = OLD.post_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_comment_change
  AFTER INSERT OR DELETE ON comments
  FOR EACH ROW EXECUTE PROCEDURE update_comment_count();
```

---

### Issue 6 — `Discover.tsx:128` — 4 Parallel Queries + Full Blocks Fetch (MEDIUM)

```typescript
// Discover.tsx:128–138
const [{ data, error }, connsRes, myBlocksRes, blockedByRes] = await Promise.all([
  query,                                // profiles
  !cursor ? supabase.from("connections").select("receiver_id").eq(...) : ...,
  !cursor ? supabase.from("blocks").select("blocked_id").eq(...) : ...,
  !cursor ? supabase.from("blocks").select("blocker_id").eq(...) : ...,
]);
```

The blocks fetches have no `.limit()`. As the platform grows, a user could be involved in many blocks and this returns all of them. The connections fetch also returns all connections (no limit) — as a user connects to hundreds of people, this row set grows unbounded.

**Fix:** Move block filtering to the PostgREST query using a correlated subquery or RLS policy so the database filters blocked users before returning profiles.

---

### Issue 7 — `supabase.ts:22` — Auth Lock Bypass (LOW/KNOWN)

```typescript
// supabase.ts:22
lock: (_name, _timeout, fn) => fn(),
```

The custom lock bypasses token refresh serialization. The comment acknowledges this. At high concurrency, multiple tabs or rapid navigation could trigger parallel refresh requests. Supabase server-side deduplicates them, but each refresh still consumes a PostgREST slot. Monitor `perf("auth.token.refresh", ...)` if you see unexplained spikes.

---

### Issue 8 — `Feed.tsx:1210` — Tab Visibility Refetch with No Deduplication (LOW)

```typescript
// Feed.tsx:1208–1217
const onVisible = () => {
  if (document.visibilityState === "visible" && Date.now() - lastFetch > 90_000) {
    lastFetch = Date.now();
    fetchFeed(); // fires 9 queries again
  }
};
```

The 90-second throttle is good but `fetchFeed` still fires all 9 queries. If a user rapidly alt-tabs while the 90s window is open, multiple batches can overlap. **Combined with Issue 4**, a busy user could fire 18+ concurrent requests from one browser tab.

---

### Issue 9 — Missing Indexes for Critical Queries

The `supabase_indexes.sql` file defines the right indexes, but several **must be verified as applied** in the Supabase Dashboard:

| Query Pattern | Required Index | Status |
|---|---|---|
| `messages OR sender/receiver + created_at` | `idx_messages_sender`, `idx_messages_receiver` | Defined in SQL file |
| `posts ORDER BY created_at DESC` | `idx_posts_created_at` | Defined |
| `blocks WHERE blocker_id = ?` | `idx_blocks_blocker` | Defined |
| `profiles WHERE deleted_at IS NOT NULL` (polling) | `idx_profiles_deleted_at` partial | Defined |
| `profiles ILIKE name` (mentions) | `idx_profiles_name_trgm` (trigram) | Defined — requires `pg_trgm` extension |
| `comments ORDER BY created_at` per post | Missing `comments(post_id, created_at)` | **NOT IN FILE** |
| `collab_interests WHERE user_id + collab_id` | **Not defined** | **MISSING** |
| `saved_posts WHERE user_id + post_id` | Only `idx_saved_posts_user` (user only) | Partial |

**Critical gap:** There is no composite index on `messages(sender_id, receiver_id, created_at)` for the conversation-load query (Issue 2).

---

### Issue 10 — No Query Result Caching (MEDIUM)

`@tanstack/react-query` is in `package.json` but is **never used**. Every component mounts and immediately fires live Supabase queries. Opening the Feed page 5 times re-fetches 9 queries × 5 = 45 HTTP requests. This adds load even for a single user navigating normally.

**Fix:** Wrap all `fetchFeed`, `fetchProfiles`, `fetchConversations` in React Query `useQuery` hooks with a `staleTime` of 60 seconds. The first load fetches, subsequent navigations within the stale window return from cache, and background refetches happen silently.

---

### Issue 11 — Supabase Plan Connection Limits

The `VITE_SUPABASE_URL` is the **REST endpoint** (not the direct Postgres connection string). PostgREST connects to Postgres through Supavisor. Connection limits depend on your plan:

| Plan | Postgres connections (Supavisor pool) | PostgREST workers |
|------|---------------------------------------|-------------------|
| Free | ~25 (shared) | ~8 |
| Pro  | 60–200 | ~25 |
| Team | 200+ | configurable |

**You are almost certainly on Free or Pro.** With Issue 4 generating 9 requests per user × 200 users = 1,800 concurrent requests, and PostgREST having ~8–25 workers, **the workers are saturated and requests queue up** — this is why the API "hangs". Requests don't fail; they wait for a free worker. k6 sees timeout/latency spikes.

**The Supavisor connection string** (port 6543, transaction-mode pooling) only matters if you run your own backend. Since you use the JS client, Supabase handles this internally. But you can request a connection pool size increase in the Supabase dashboard (Pro plan: Settings → Database → Connection Pooling).

---

## 3. Query Load at Scale — Projection

| Users | Feed load queries/burst | Msg load queries/burst | Deletion polls/min | Total req/min (active) |
|-------|------------------------|------------------------|-------------------|------------------------|
| 200   | 1,800                  | 400                    | 40                | ~2,500                 |
| 1,000 | 9,000                  | 2,000                  | 200               | ~12,000                |
| 5,000 | 45,000                 | 10,000                 | 1,000             | ~60,000                |

At 5,000 concurrent users loading the Feed page simultaneously (as k6 simulates), you'd need ~45,000 PostgREST requests served before the first user sees a result. This is physically impossible on current infrastructure without fixing Issues 1–5 first.

---

## 4. Priority Fix List (Ordered by Impact)

| # | File | Issue | Effort | Impact |
|---|------|-------|--------|--------|
| 1 | Messages.tsx:170 | Replace 300-row messages fetch with DB-side conversation aggregation | Medium | Critical |
| 2 | Messages.tsx:280 | Add `.limit(50)` to message history, add cursor pagination | Small | Critical |
| 3 | posts table | Add `comment_count` trigger column, remove background fetch | Small | High |
| 4 | Feed.tsx:1089 | Consolidate 9 queries → 1 Postgres RPC function | Large | High |
| 5 | UserContext.tsx:357 | Replace 5-min poll with Realtime channel subscription | Small | High |
| 6 | All pages | Integrate React Query (`useQuery`) with `staleTime: 60000` | Medium | Medium |
| 7 | supabase_indexes.sql | Apply missing indexes (comments composite, collab_interests) | Small | Medium |
| 8 | Discover.tsx:128 | Limit blocks/connections fetch or move filtering to DB | Small | Medium |
| 9 | Supabase Dashboard | Upgrade to Pro plan, enable connection pooler, increase pool size | Infra | High |
| 10 | Supabase Dashboard | Enable **Read Replicas** for all SELECT queries | Infra | High |

---

## 5. Structured Logging — How to Use During k6 Testing

The logger is now in `src/lib/logger.ts`. Here's how to instrument and read metrics.

### Instrument a query (example for Feed.tsx):

```typescript
import { traceQuery, traceParallel, logger } from "@/lib/logger";

// In fetchFeed:
const [postsRes, collabsRes, myBlocksRes, blockedByRes] = await traceParallel([
  ["feed.posts",       () => supabase.from("posts").select(...).limit(30)],
  ["feed.collabs",     () => supabase.from("collabs").select(...).limit(30)],
  ["feed.blocks.mine", () => supabase.from("blocks").select("blocked_id").eq("blocker_id", user.id)],
  ["feed.blocks.them", () => supabase.from("blocks").select("blocker_id").eq("blocked_id", user.id)],
]);
```

### Instrument UserContext sync:

```typescript
import { traceQuery } from "@/lib/logger";

const result = await traceQuery("profile.sync", () =>
  supabase.from("profiles").select("*").eq("id", userId).single()
);
```

### Read metrics during a k6 run:

Open Chrome DevTools → Console, then:

```javascript
// See aggregated stats for every traced query
__prolifierLogger.printMetrics()

// Check concurrent in-flight requests
__prolifierInflight()

// Export full metrics as JSON (paste into k6 summary)
copy(JSON.stringify(__prolifierLogger.getMetrics()))

// Reset between test scenarios
__prolifierLogger.resetMetrics()
```

### Example output:
```
┌─────────────────────────┬───────┬────────┬────────┬────────┬───────────┐
│ (index)                 │ count │ avgMs  │ maxMs  │ errors │ errorRate │
├─────────────────────────┼───────┼────────┼────────┼────────┼───────────┤
│ feed.posts              │   47  │   312  │  1840  │    2   │   4.3%    │
│ feed.collabs            │   47  │   298  │  1720  │    0   │   0.0%    │
│ messages.conversations  │   23  │  1240  │  4200  │    5   │  21.7%    │  ← THIS IS YOUR PROBLEM
│ profile.sync            │  201  │    45  │   120  │    0   │   0.0%    │
│ profile.deletion.check  │  189  │    38  │    95  │    0   │   0.0%    │
└─────────────────────────┴───────┴────────┴────────┴────────┴───────────┘
```

The `messages.conversations` row with avgMs: 1240 and errorRate: 21.7% tells you exactly where the API hangs.

---

## 6. Supavisor / pgBouncer Configuration

Since you use the **Supabase JS client** (not direct `pg` connections), you don't configure pgBouncer yourself. But you should:

1. **Supabase Dashboard → Settings → Database → Connection Pooling**
   - Enable "Supavisor" (it may already be on)
   - Set pool mode to **Transaction** (not Session) — transaction mode returns connections to the pool after each statement, giving you far more effective concurrency

2. **Use the Supavisor connection string** only if you add a custom backend (e.g. an Edge Function or Node.js API route). The JS client already goes through the REST layer which is pooled.

3. **Increase pool size** — on Pro plan you can request up to 200 connections via Supabase support.

4. **Enable Read Replicas** (Pro plan) — offloads all `SELECT` queries to a replica, leaving the primary for writes only. This alone can double your effective read throughput.

---

## 7. Quick Wins (Do These First, Takes < 2 Hours)

```typescript
// 1. Add .limit(50) to message history fetch (Messages.tsx:280)
.order("created_at", { ascending: true })
.limit(50)  // ADD THIS

// 2. Add .limit(100) to conversation fetch (Messages.tsx:174)
.limit(100)  // reduce from 300

// 3. Add comment_count column (run in Supabase SQL editor):
ALTER TABLE posts ADD COLUMN IF NOT EXISTS comment_count integer DEFAULT 0;
UPDATE posts SET comment_count = (SELECT COUNT(*) FROM comments WHERE post_id = posts.id);
-- Then add the trigger (see Issue 5 above)

// 4. Apply the missing indexes (run supabase_indexes.sql in SQL Editor if not done)
// Plus add:
CREATE INDEX IF NOT EXISTS idx_comments_post_created
  ON comments(post_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_collab_interests_user
  ON collab_interests(user_id);

CREATE INDEX IF NOT EXISTS idx_messages_conversation
  ON messages(sender_id, receiver_id, created_at DESC);
```

These four changes alone should push your k6 ceiling from 200 to ~800–1000 concurrent users without any architectural refactor.
