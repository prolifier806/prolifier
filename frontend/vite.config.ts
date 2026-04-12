import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    // Raise the chunk warning threshold — individual page chunks around 500KB are fine
    chunkSizeWarningLimit: 600,
    // WHY: Hidden source maps let you debug production errors without exposing
    // source code to end users. 'hidden' means no //# sourceMappingURL comment
    // in the bundle — maps are uploaded to Sentry/Datadog separately.
    sourcemap: "hidden",
    rollupOptions: {
      output: {
        // WHY: Content-hash filenames ensure CDN/browser caches are busted
        // automatically on deploy without needing a cache-invalidation step.
        chunkFileNames: "assets/[name]-[hash].js",
        entryFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash].[ext]",
        manualChunks: (id) => {
          // Each vendor chunk is cached independently — a Radix update doesn't
          // bust the React cache, and vice versa.
          if (id.includes("lucide-react")) return "vendor-icons";
          if (id.includes("react-dom") || id.includes("react-router-dom") || id.includes("/react/")) return "vendor-react";
          if (id.includes("@supabase")) return "vendor-supabase";
          if (id.includes("@tanstack")) return "vendor-query";
          // recharts is ~500KB — keep it isolated so pages without charts load fast
          if (id.includes("recharts") || id.includes("d3-") || id.includes("victory")) return "vendor-charts";
          if (id.includes("@radix-ui")) return "vendor-radix";
          if (id.includes("date-fns") || id.includes("zod") || id.includes("clsx") || id.includes("tailwind-merge")) return "vendor-utils";
        },
      },
    },
  },
}));
