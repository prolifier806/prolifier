import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from "react";
import { v4 as uuidv4 } from "uuid";

export type JobStatus = "uploading" | "processing" | "done" | "failed";

export interface UploadJob {
  id: string;
  label: string;
  status: JobStatus;
  progress: number;
  retryFn?: () => void;
}

interface Ctx {
  jobs: UploadJob[];
  addJob(label: string): string;
  updateJob(id: string, patch: Partial<Omit<UploadJob, "id">>): void;
  removeJob(id: string): void;
}

const UploadQueueCtx = createContext<Ctx | null>(null);

export function UploadQueueProvider({ children }: { children: ReactNode }) {
  const [jobs, setJobs] = useState<UploadJob[]>([]);

  const addJob = useCallback((label: string): string => {
    const id = uuidv4();
    setJobs(prev => [...prev, { id, label, status: "uploading", progress: 0 }]);
    return id;
  }, []);

  const updateJob = useCallback((id: string, patch: Partial<Omit<UploadJob, "id">>) => {
    setJobs(prev => prev.map(j => j.id === id ? { ...j, ...patch } : j));
  }, []);

  const removeJob = useCallback((id: string) => {
    setJobs(prev => prev.filter(j => j.id !== id));
  }, []);

  // Auto-remove done jobs after 4s
  useEffect(() => {
    const doneIds = jobs.filter(j => j.status === "done").map(j => j.id);
    if (!doneIds.length) return;
    const t = setTimeout(() => {
      setJobs(prev => prev.filter(j => !doneIds.includes(j.id)));
    }, 4000);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobs.map(j => j.id + j.status).join(",")]);

  return (
    <UploadQueueCtx.Provider value={{ jobs, addJob, updateJob, removeJob }}>
      {children}
    </UploadQueueCtx.Provider>
  );
}

export function useUploadQueue() {
  const ctx = useContext(UploadQueueCtx);
  if (!ctx) throw new Error("useUploadQueue outside UploadQueueProvider");
  return ctx;
}
