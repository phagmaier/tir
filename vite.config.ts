import { defineConfig } from "vitest/config";

// Tauri loads the dev server at this fixed port (src-tauri/tauri.conf.json).
export default defineConfig({
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: { ignored: ["**/src-tauri/**"] },
  },
  envPrefix: ["VITE_", "TAURI_ENV_"],
  test: {
    include: ["src/**/*.test.ts", "tools/**/*.test.ts"],
    environment: "node",
  },
});
