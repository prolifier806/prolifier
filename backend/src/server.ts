import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import compression from "compression";

import postsRouter from "./routes/posts";
import connectionsRouter from "./routes/connections";
import notificationsRouter from "./routes/notifications";
import messagesRouter from "./routes/messages";
import usersRouter from "./routes/users";
import uploadsRouter from "./routes/uploads";
import reportsRouter from "./routes/reports";
import feedbackRouter from "./routes/feedback";
import adminRouter from "./routes/admin";
import groupsRouter from "./routes/groups";

const app = express();
const PORT = process.env.PORT ?? 3001;

// ── Trust proxy — required for correct client IP behind Render/Vercel/Nginx ──
// WHY: Without this, req.ip returns the load balancer IP, breaking rate limiting
// (all users appear as the same IP and hit limits together or are never limited).
app.set("trust proxy", 1);

// ── Security headers ──────────────────────────────────────────────────────────
app.use(helmet({
  // WHY: Default helmet CSP is too restrictive for API servers and adds overhead.
  // We explicitly disable contentSecurityPolicy since this is a JSON API, not HTML.
  contentSecurityPolicy: false,
  // Prevent MIME sniffing — important for file upload endpoints
  noSniff: true,
}));

// ── CORS — single config object reused for both middleware and OPTIONS handler ─
// WHY: Duplicating the CORS config means a maintenance bug where one copy is
// updated but the other isn't — allowing or blocking origins inconsistently.
const allowedOrigins = new Set([
  process.env.FRONTEND_URL ?? "http://localhost:5173",
  "http://localhost:5173",
  "https://prolifier.com",
  "https://www.prolifier.com",
  "https://prolifier.vercel.app",
]);

const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.has(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS blocked: ${origin}`));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

// ── Rate limiting ─────────────────────────────────────────────────────────────
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300,                  // max 300 requests per window per IP
  standardHeaders: true,
  legacyHeaders: false,
  // WHY: keyGenerator uses req.ip which is now correct because trust proxy is set
  keyGenerator: (req) => req.ip ?? req.socket.remoteAddress ?? "unknown",
  message: { success: false, error: "Too many requests, please try again later." },
});

const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 50,                   // max 50 uploads per hour per IP
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip ?? req.socket.remoteAddress ?? "unknown",
  message: { success: false, error: "Upload limit reached, please try again later." },
});

app.use("/api/", apiLimiter);
app.use("/api/uploads", uploadLimiter);

// ── Response compression ──────────────────────────────────────────────────────
// WHY: JSON API responses are highly compressible (text). Compression cuts
// payload size 60-80%, reducing bandwidth costs and improving TTFB for slow
// clients. Skips already-compressed content types (images, video) automatically.
app.use(compression({
  level: 6,       // zlib level 6 — good balance of speed vs compression ratio
  threshold: 1024, // only compress responses > 1KB (tiny responses not worth the CPU)
}));

// ── Body parsing ──────────────────────────────────────────────────────────────
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

// ── Health check ──────────────────────────────────────────────────────────────
app.get("/health", (_, res) => res.json({ status: "ok", ts: Date.now() }));

// ── API routes ────────────────────────────────────────────────────────────────
app.use("/api/feed", postsRouter);
app.use("/api/connections", connectionsRouter);
app.use("/api/notifications", notificationsRouter);
app.use("/api/messages", messagesRouter);
app.use("/api/users", usersRouter);
app.use("/api/uploads", uploadsRouter);
app.use("/api/reports", reportsRouter);
app.use("/api/feedback", feedbackRouter);
app.use("/api/admin", adminRouter);
app.use("/api/groups", groupsRouter);

// ── 404 catch-all ────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, error: `Route ${req.method} ${req.path} not found` });
});

// ── Global error handler ──────────────────────────────────────────────────────
// WHY: Returning err.message verbatim leaks internal details (DB errors, file paths,
// stack traces) to clients. In production, return a generic message; log the real one.
app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("[error]", err.message);
  const origin = req.headers.origin as string | undefined;
  if (origin && allowedOrigins.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
  }
  // Never expose raw error messages in production
  const isProduction = process.env.NODE_ENV === "production";
  const message = isProduction ? "Internal server error" : (err.message ?? "Internal server error");
  res.status(500).json({ success: false, error: message });
});

app.listen(Number(PORT), "0.0.0.0", () => {
  console.log(`[server] Prolifier API running on http://0.0.0.0:${PORT}`);
});

export default app;
