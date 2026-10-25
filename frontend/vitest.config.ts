import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    // The suite renders deterministic fixtures; live path is tested separately
    // in live-ask.test.ts by stubbing this switch off.
    env: { VITE_USE_FIXTURES: "true" },
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
