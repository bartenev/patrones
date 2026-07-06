/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from "vite"
import vue from "@vitejs/plugin-vue"

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "")

  return {
    base: env.VITE_BASE_PATH || "/",
    plugins: [vue()],
    server: {
      port: 5173,
      strictPort: true,
      open: true
    },
    test: {
      environment: "happy-dom",
      setupFiles: ["src/test/setup.ts"],
      fileParallelism: false,
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
        ],
        thresholds: {
          lines: 95,
          statements: 95,
          functions: 95,
          branches: 95
        }
      }
    }
  }
})
