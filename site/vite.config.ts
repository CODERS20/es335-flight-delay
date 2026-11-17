import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The site is served from https://<user>.github.io/es335-flight-delay/, so every
// asset URL needs that prefix. Build output goes straight into ../docs, which is
// the folder GitHub Pages publishes.
export default defineConfig({
  plugins: [react()],
  base: "/es335-flight-delay/",
  build: {
    outDir: "../docs",
    emptyOutDir: true,
    assetsDir: "assets",
  },
});
