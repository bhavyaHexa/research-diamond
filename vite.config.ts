import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Two pages: the engine-backed viewer (index.html) and the Hexa 3D Viewer (hexa-viewer.html).
export default defineConfig({
  plugins: [react()],
  build: { rollupOptions: { input: { main: "index.html", hexaViewer: "hexa-viewer.html" } } },
});
