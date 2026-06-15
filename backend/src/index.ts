import express from "express";
import { config } from "../config";
import chatRoutes from "./routes/chat";
import containerRoutes from "./routes/containers";
import deployRoutes from "./routes/deploy";
import { initModels } from "./services/models";
import modelsRoutes from "./routes/models";
import promptRoutes from "./routes/prompts";
import { recoverRunningProjects } from "./services/project";

const app = express();

// /health 放在最前，不经过 body 解析，确保可快速返回
app.get("/health", (_req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.status(200).end(JSON.stringify({ ok: true }));
});

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, PATCH, OPTIONS");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept, Authorization"
  );

  if (req.method === "OPTIONS") {
    res.sendStatus(200);
  } else {
    next();
  }
});

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

app.use("/containers", containerRoutes);
app.use("/chat", chatRoutes);
app.use("/deploy", deployRoutes);
app.use("/models", modelsRoutes);
app.use("/prompts", promptRoutes);

initModels(config.aiSdk.baseUrl);

const PORT = Number(process.env.PORT || 4002);

function startServer() {
  const server = app.listen(PORT);

  server.keepAliveTimeout = 5000;
  server.headersTimeout = 6000;

  server.on("listening", () => {
    console.log(`December API running on port ${PORT}`);
    console.log(`AI model: ${config.aiSdk.model}`);
    recoverRunningProjects().catch((e) =>
      console.error("[recover] Failed to recover running projects:", e)
    );
  });

  function shutdown() {
    // 强制销毁所有已有连接，确保端口立即释放
    server.closeAllConnections?.();
    server.close(() => process.exit(0));
    // 兜底：3 秒后强制退出
    setTimeout(() => process.exit(0), 3000).unref();
  }

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      console.warn(`Port ${PORT} in use, retrying in 2s...`);
      server.close();
      setTimeout(startServer, 2000);
    } else {
      throw err;
    }
  });
}

startServer();

export default app;
// DEBUG
process.nextTick(() => console.log('[DEBUG] AI_BASE_URL env:', process.env.AI_BASE_URL));
