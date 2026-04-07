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
        // Prevent Rollup from creating hundreds of tiny icon files.
        // Any chunk smaller than 20KB gets merged into its importer.
        experimentalMinChunkSize: 20_000,
        // WHY: Content-hash filenames ensure CDN/browser caches are busted
        // automatically on deploy without needing a cache-invalidation step.
        chunkFileNames: "assets/[name]-[hash].js",
        entryFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash].[ext]",
        manualChunks: (id) => {
          // Group all Lucide icons into one chunk instead of one file per icon
          if (id.includes("lucide-react")) return "vendor-icons";
          if (id.includes("react-dom") || id.includes("react-router-dom") || id.includes("/react/")) return "vendor-react";
          if (id.includes("@supabase")) return "vendor-supabase";
          // WHY: recharts is ~500KB — isolating it prevents it from bloating the
          // main bundle for users who never visit a page that uses charts.
          if (id.includes("recharts")) return "vendor-charts";
          if (id.includes("@radix-ui")) return "vendor-radix";
        },
      },
    },
  },
}));
