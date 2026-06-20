import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

// Vite dev server port is taken from the PORT env var so the V1 backend
// (which assigns a unique port per project in 8000+) controls where each
// template instance listens. `host: true` binds 0.0.0.0 so the iframe
// preview can reach it.
export default defineConfig({
  plugins: [vue()],
  server: {
    host: true,
    port: Number(process.env.PORT) || 5173,
    strictPort: true,
  },
});
