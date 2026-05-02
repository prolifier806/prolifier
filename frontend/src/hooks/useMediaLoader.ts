import { useCallback, useEffect, useRef, useState } from "react";
import { downloadManager, DownloadProgress } from "@/lib/downloadManager";

export type MediaState = "idle" | "downloading" | "loaded" | "error";

export interface UseMediaLoaderResult {
  state: MediaState;
  objectUrl: string | null;
  progress: DownloadProgress | null;
  startDownload: () => void;
  cancelDownload: () => void;
}

export function useMediaLoader(fileId: string, url: string): UseMediaLoaderResult {
  // Synchronous init: memory hit → loaded instantly; localStorage flag → loaded (blob coming from IDB)
  const [state, setState] = useState<MediaState>(() => {
    if (downloadManager.fromMemory(fileId)) return "loaded";
    if (downloadManager.wasDownloaded(fileId)) return "loaded";
    return "idle";
  });
  const [objectUrl, setObjectUrl] = useState<string | null>(() =>
    downloadManager.fromMemory(fileId)
  );
  const [progress, setProgress] = useState<DownloadProgress | null>(null);

  const cancelRef = useRef<(() => void) | null>(null);
  const stateRef = useRef(state);
  useEffect(() => { stateRef.current = state; }, [state]);

  // On mount: check IDB for cached blob (avoids network on revisit)
  useEffect(() => {
    if (stateRef.current === "loaded") return;
    downloadManager.fromDb(fileId).then(cached => {
      if (cached && stateRef.current !== "loaded") {
        setObjectUrl(cached);
        setState("loaded");
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileId]);

  const startDownload = useCallback(() => {
    if (stateRef.current === "loaded" || stateRef.current === "downloading") return;
    setState("downloading");
    setProgress(null);

    const cancel = downloadManager.subscribe(fileId, url, {
      onProgress: p => setProgress(p),
      onComplete: objUrl => {
        setObjectUrl(objUrl);
        setState("loaded");
        setProgress(null);
        cancelRef.current = null;
      },
      onError: () => {
        setState("error");
        setProgress(null);
        cancelRef.current = null;
      },
    });

    cancelRef.current = cancel;
  }, [fileId, url]);

  const cancelDownload = useCallback(() => {
    cancelRef.current?.();
    cancelRef.current = null;
    setState("idle");
    setProgress(null);
  }, []);

  // Abort in-flight download on unmount
  useEffect(() => () => { cancelRef.current?.(); }, []);

  return { state, objectUrl, progress, startDownload, cancelDownload };
}
