import { dbGet, dbSet } from "./mediaDb";

// ── Memory cache (session-persistent) ────────────────────────────────────────
const memCache = new Map<string, { blob: Blob; objectUrl: string }>();

// ── Types ─────────────────────────────────────────────────────────────────────
export interface DownloadProgress {
  loaded: number; // bytes received
  total: number;  // bytes expected (0 if unknown)
}

interface DownloadCallbacks {
  onProgress?: (p: DownloadProgress) => void;
  onComplete: (objectUrl: string) => void;
  onError: (err: Error) => void;
}

interface DownloadItem {
  fileId: string;
  url: string;
  listeners: Set<DownloadCallbacks>;
  controller: AbortController;
}

// ── Queue ─────────────────────────────────────────────────────────────────────
const MAX_CONCURRENT = 3;
const active = new Map<string, DownloadItem>();
const pending: DownloadItem[] = [];

function tick() {
  while (active.size < MAX_CONCURRENT && pending.length > 0) {
    const item = pending.shift()!;
    if (item.listeners.size > 0) execute(item);
    else tick(); // all listeners gone — skip and try next
  }
}

async function execute(item: DownloadItem) {
  active.set(item.fileId, item);
  try {
    const res = await fetch(item.url, { signal: item.controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const contentLength = Number(res.headers.get("content-length") ?? 0);
    const reader = res.body?.getReader();

    let blob: Blob;
    if (reader) {
      const chunks: Uint8Array[] = [];
      let received = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.length;
        const progress: DownloadProgress = { loaded: received, total: contentLength };
        item.listeners.forEach(cb => cb.onProgress?.(progress));
      }
      blob = new Blob(chunks);
    } else {
      blob = await res.blob();
    }

    const objectUrl = URL.createObjectURL(blob);
    memCache.set(item.fileId, { blob, objectUrl });
    dbSet(item.fileId, blob); // fire-and-forget persistence

    item.listeners.forEach(cb => cb.onComplete(objectUrl));
  } catch (err) {
    const e = err as Error;
    if (e.name !== "AbortError") {
      item.listeners.forEach(cb => cb.onError(e));
    }
  } finally {
    active.delete(item.fileId);
    tick();
  }
}

// ── Public API ────────────────────────────────────────────────────────────────
export const downloadManager = {
  /**
   * Resolves objectUrl from memory, IDB, or network.
   * Returns a cancel function — call it to detach this listener.
   * If no listeners remain after detach, the download is aborted.
   */
  subscribe(fileId: string, url: string, callbacks: DownloadCallbacks): () => void {
    // 1. Memory cache hit — instant
    const mem = memCache.get(fileId);
    if (mem) {
      callbacks.onComplete(mem.objectUrl);
      return () => {};
    }

    // 2. Already in-flight — attach listener
    const inFlight = active.get(fileId) ?? pending.find(q => q.fileId === fileId);
    if (inFlight) {
      inFlight.listeners.add(callbacks);
      return () => {
        inFlight.listeners.delete(callbacks);
        if (inFlight.listeners.size === 0) {
          inFlight.controller.abort();
          const idx = pending.indexOf(inFlight as DownloadItem);
          if (idx !== -1) pending.splice(idx, 1);
        }
      };
    }

    // 3. New download
    const item: DownloadItem = {
      fileId,
      url,
      listeners: new Set([callbacks]),
      controller: new AbortController(),
    };

    if (active.size < MAX_CONCURRENT) {
      execute(item);
    } else {
      pending.push(item);
    }

    return () => {
      item.listeners.delete(callbacks);
      if (item.listeners.size === 0) {
        item.controller.abort();
        const idx = pending.indexOf(item);
        if (idx !== -1) pending.splice(idx, 1);
      }
    };
  },

  /** Synchronous memory-cache lookup */
  fromMemory(fileId: string): string | null {
    return memCache.get(fileId)?.objectUrl ?? null;
  },

  /** Async IDB lookup — also populates memory cache on hit */
  async fromDb(fileId: string): Promise<string | null> {
    const blob = await dbGet(fileId);
    if (!blob) return null;
    const objectUrl = URL.createObjectURL(blob);
    memCache.set(fileId, { blob, objectUrl });
    return objectUrl;
  },
};
