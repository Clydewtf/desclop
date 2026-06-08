import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/app/test-utils.tsx"],
    exclude: ["tests/e2e/**", "node_modules/**", "dist/**"],
    globals: true,
    css: true
  }
});
