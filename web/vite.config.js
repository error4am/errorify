import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Proxy any /api requests to your backend running on :3001
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
        secure: false,
        // rewrite not needed since we want /api/... to stay /api/...
      }
    }
  }
});
