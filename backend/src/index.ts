import express from "express";
import { config } from "../config";
import chatRoutes from "./routes/chat";
import containerRoutes from "./routes/containers";

const app = express();

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
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

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/containers", containerRoutes);
app.use("/chat", chatRoutes);

const PORT = process.env.PORT || 4001;
const server = app.listen(PORT, () => {
  console.log(`December API running on port ${PORT}`);
  console.log(`AI provider: ${config.aiSdk.provider}`);
});

server.keepAliveTimeout = 0;
server.headersTimeout = 0;

// 防止在部分环境下进程被提前退出
const keepAlive = setInterval(() => {}, 2 ** 31 - 1);
server.on("close", () => clearInterval(keepAlive));

export default app;
