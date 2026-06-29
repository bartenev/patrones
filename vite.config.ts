/// <reference types="vitest/config" />
import { defineConfig } from "vite"
import vue from "@vitejs/plugin-vue"

export default defineConfig({
  plugins: [vue()],
  server: {
    host: true,
    port: 5173,
    open: true
  },
  test: {
    environment: "happy-dom",
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,vue}"],
      exclude: [
        "src/main.ts",
        "src/vite-env.d.ts",
        "src/types.ts",
        "src/test/**",
        "src/**/*.test.ts",
        "src/**/*.spec.ts"
      ]
    }
  }
})
