import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, import.meta.dirname, '')
  return {
    plugins: [react(), tailwindcss()],
    resolve: { alias: { '@': path.resolve(import.meta.dirname, './src') } },
    // Dev only: forward /api to the arena server (agent/src/server.ts).
    server: env.ARENA_PROXY_TARGET
      ? { proxy: { '/api': { target: env.ARENA_PROXY_TARGET, changeOrigin: true } } }
      : undefined,
  }
})
