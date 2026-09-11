/**
 * 运行环境判断工具。
 *
 * 目前只需要判断是否处于 Tauri WebView 中：Tauri 会在 window 上注入
 * `__TAURI_INTERNALS__`，浏览器环境则没有。
 */
export function isTauriEnvironment(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof (window as unknown as { __TAURI_INTERNALS__?: unknown })
      .__TAURI_INTERNALS__ !== 'undefined'
  )
}