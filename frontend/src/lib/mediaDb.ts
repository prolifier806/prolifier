const DB_NAME = "prolifier_media_v1";
const DB_VERSION = 1;
const STORE = "blobs";

let _db: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (_db) return _db;
  _db = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE, { keyPath: "fileId" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      _db = null;
      reject(req.error);
    };
  });
  return _db;
}

export async function dbGet(fileId: string): Promise<Blob | null> {
  try {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(fileId);
      req.onsuccess = () => resolve((req.result as any)?.blob ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

export async function dbSet(fileId: string, blob: Blob): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      const req = tx.objectStore(STORE).put({ fileId, blob });
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    // IDB unavailable (private browsing, quota exceeded) — silently ignore
  }
}
