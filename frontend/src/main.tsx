import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App.tsx";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Re-use cached data for 60 seconds before background-refetching.
      // Eliminates duplicate network calls when the user navigates between
      // pages within the same session.
      staleTime: 60_000,
      // Keep unused query results in cache for 5 minutes before GC.
      gcTime: 5 * 60_000,
      // Don't hammer the server on transient network errors — retry once.
      retry: 1,
      // Don't refetch just because the window regained focus (Feed already
      // handles this with its own 90-second visibilitychange throttle).
      refetchOnWindowFocus: false,
    },
  },
});

createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}>
    <App />
  </QueryClientProvider>
);
