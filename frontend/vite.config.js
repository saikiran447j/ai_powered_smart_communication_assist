import fs from "node:fs";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const httpsOptions = (() => {
  try {
    return {
      key: fs.readFileSync(new URL("./certs/dev-server.key", import.meta.url)),
      cert: fs.readFileSync(new URL("./certs/dev-server.crt", import.meta.url)),
    };
  } catch {
    return undefined;
  }
})();

export default defineConfig({
  plugins: [react()],
  // Read .env from the repo root, so VITE_ vars live in one place
  // alongside the backend's own env vars instead of a second frontend/.env.
  envDir: "..",
  server: {
    // host: true exposes the dev server on your LAN IP (not just
    // localhost), which is required to open this on a phone for the
    // two-device WebRTC test described in the project README.
    host: "0.0.0.0",
    port: 5173,
    https: httpsOptions,
    proxy: {
      // Proxy API requests to the backend running on localhost:8000 so
      // the browser talks to the dev server origin and avoids mixed
      // content (HTTPS front-end -> HTTP backend) during development.
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
        secure: false,
      },
    },
  },
  preview: {
    host: "0.0.0.0",
    port: 4173,
    https: httpsOptions,
  },
});
