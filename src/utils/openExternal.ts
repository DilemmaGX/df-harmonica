import { isTauriEnvironment } from './env'

/**
 * 在系统默认浏览器中打开外部链接。
 *
 * - Tauri 环境：通过 `@tauri-apps/plugin-opener` 调用系统 opener，
 *   因为 WebView 会拦截 `<a target="_blank">` 的外部跳转。
 * - 浏览器环境：`window.open(url, '_blank', 'noopener,noreferrer')`。
 */
export async function openExternal(url: string): Promise<void> {
  if (isTauriEnvironment()) {
    try {
      const { openUrl } = await import('@tauri-apps/plugin-opener')
      await openUrl(url)
      return
    } catch {
      // 插件失败时回退到 window.open，仍然尝试打开
    }
  }
  window.open(url, '_blank', 'noopener,noreferrer')
}