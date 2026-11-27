import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
const allowedHosts = ["t3.tail5e2d71.ts.net"];
export default defineConfig({
  plugins: [react()],
  server: { allowedHosts, proxy: { "/api": "http://127.0.0.1:8742" } },
  preview: { allowedHosts },
});
