import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";

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

// ── Security headers ──────────────────────────────────────────────────────────
app.use(helmet());

// ── CORS — allow configured frontend origin + www variant ────────────────────
const allowedOrigins = [
  process.env.FRONTEND_URL ?? "http://localhost:5173",
  "http://localhost:5173",
  "https://prolifier.com",
  "https://www.prolifier.com",
];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS blocked: ${origin}`));
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// ── Body parsing ──────────────────────────────────────────────────────────────
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

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
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("[error]", err.message);
  res.status(500).json({ success: false, error: "Internal server error" });
});

app.listen(Number(PORT), "0.0.0.0", () => {
  console.log(`[server] Prolifier API running on http://0.0.0.0:${PORT}`);
});

export default app;
