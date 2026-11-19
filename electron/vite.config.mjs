import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import fs from "fs";
import path from "path";

function loadCert() {
  try {
    return {
      cert: fs.readFileSync(path.resolve("172.20.10.2+4.pem")),
      key:  fs.readFileSync(path.resolve("172.20.10.2+4-key.pem")),
    };
  } catch {
    return undefined;
  }
}

export default defineConfig({
  plugins: [react()],
  base: "./",
  build: { outDir: "dist" },
  server: {
    port: 5173,
    host: true,
    https: loadCert(),
    proxy: {
      "/songs":    { target: "http://localhost:8000", changeOrigin: true },
      "/sessions": { target: "http://localhost:8000", changeOrigin: true },
      "/phrases":  { target: "http://localhost:8000", changeOrigin: true },
      "/piano":    { target: "http://localhost:8000", changeOrigin: true },
      "/health":   { target: "http://localhost:8000", changeOrigin: true },
      "/pitch":    { target: "ws://localhost:8000",   ws: true },
    },
  },
});
