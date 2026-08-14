import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/optothermal_simulator/",
  plugins: [react()],
  build: {
    target: "es2022",
    sourcemap: true,
    cssMinify: "esbuild",
  },
  worker: {
    format: "es",
  },
});
