import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Two pages: the engine-backed viewer (index.html) and the own viewer (own.html).
export default defineConfig({
  plugins: [react()],
  build: { rollupOptions: { input: { main: "index.html", own: "own.html" } } },
});
