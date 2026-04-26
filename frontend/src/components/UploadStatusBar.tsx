import { AlertCircle, CheckCircle2, RefreshCw, X } from "lucide-react";
import { useUploadQueue } from "@/context/UploadQueueContext";

export default function UploadStatusBar() {
  const { jobs, removeJob } = useUploadQueue();
  if (!jobs.length) return null;

  const active = jobs.filter(j => j.status === "uploading" || j.status === "processing");
  const failed = jobs.filter(j => j.status === "failed");
  const allDone = jobs.every(j => j.status === "done");

  const avgPct = active.length
    ? Math.round(active.reduce((s, j) => s + j.progress, 0) / active.length)
    : 100;

  const label = active.length
    ? active[0].status === "processing"
      ? "Processing video…"
      : `Uploading… ${avgPct}%`
    : failed.length
    ? `Upload failed · ${failed[0].label}`
    : "Shared successfully";

  const trackColor = allDone
    ? "bg-emerald-500"
    : failed.length && !active.length
    ? "bg-destructive"
    : "bg-primary";

  return (
    <div className="fixed inset-x-0 top-0 z-[300]">
      <div className="bg-card/95 backdrop-blur border-b border-border shadow-sm">
        <div className="h-0.5 bg-muted overflow-hidden">
          <div
            className={`h-full ${trackColor} transition-all duration-300`}
            style={{ width: `${avgPct}%` }}
          />
        </div>
        <div className="flex items-center justify-between px-4 py-2 text-xs gap-3">
          <div className="flex items-center gap-2 text-muted-foreground min-w-0">
            {active.length > 0 && (
              <span className="h-3 w-3 rounded-full border-2 border-primary border-t-transparent animate-spin shrink-0" />
            )}
            {allDone && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />}
            {!active.length && failed.length > 0 && (
              <AlertCircle className="h-3.5 w-3.5 text-destructive shrink-0" />
            )}
            <span className="truncate">{label}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {failed.map(j => j.retryFn && (
              <button
                key={j.id}
                onClick={j.retryFn}
                className="flex items-center gap-1 text-primary font-medium hover:underline"
              >
                <RefreshCw className="h-3 w-3" /> Retry
              </button>
            ))}
            {(allDone || (failed.length > 0 && !active.length)) && (
              <button
                onClick={() => jobs.forEach(j => removeJob(j.id))}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
