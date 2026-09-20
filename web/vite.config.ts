import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // Relative asset paths so a build can be served from any directory.
  base: "./",
  plugins: [react()],
  server: { port: 5173 },
});
