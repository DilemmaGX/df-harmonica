import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

/**
 * base 策略：
 * - Web（dev / build）    → `/df-harmonica/`  （GitHub Pages 子路径、本地 dev 也走子路径）
 * - Tauri（build:tauri）  → `./`              （相对路径，可脱网独立运行）
 *
 * 判定依据：
 * - `npm run dev`        → mode = 'development' → `/df-harmonica/`
 * - `npm run build`      → mode = 'production'  → `/df-harmonica/`
 * - `npm run build:tauri`→ mode = 'tauri'       → `./`
 *
 * `tauri dev` 走 `beforeDevCommand`（npm run dev），因此也使用 `/df-harmonica/`，
 * 与 `tauri.conf.json` 中的 `devUrl` 保持一致。
 */
export default defineConfig(({ mode }) => {
  const base = mode === 'tauri' ? './' : '/df-harmonica/'

  return {
    plugins: [react()],
    base,
  }
})