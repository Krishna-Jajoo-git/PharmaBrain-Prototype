import express from "express";
import cors from "cors";
import path from "node:path";
import authRoutes from "./routes/auth.routes.js";
import documentRoutes from "./routes/document.routes.js";
const app = express();
app.use(cors({ origin: process.env.FRONTEND_URL || true })); app.use(express.json());
app.get("/api/health", (_req, res) => res.json({ success: true, data: { status: "ok" } }));
app.use("/uploads", express.static(path.resolve("uploads")));
app.use("/api/auth", authRoutes); app.use("/api/documents", documentRoutes);
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  if (err instanceof Error && err.name === "ZodError") return res.status(400).json({ success: false, message: "Please check the submitted information.", errors: err });
  if (err instanceof Error && err.name === "MulterError") return res.status(400).json({ success: false, message: err.message });
  const message = process.env.NODE_ENV === "development" && err instanceof Error ? `Server error: ${err.message}` : "Something went wrong. Please try again.";
  return res.status(500).json({ success: false, message });
});
export default app;
