/** 八度层级配色（暖 → 中性 → 冷，对应 更低 → 默认 → 更高） */
export const NOTE_COLORS = {
  low: '#ea580c',
  default: '#7c3aed',
  high: '#0ea5e9',
} as const

/**
 * 导出 SVG 时使用的字体族。
 * 优先系统字体，避免依赖外部 CDN。
 */
export const EXPORT_FONT_FAMILY =
  "system-ui, -apple-system, 'Segoe UI', Roboto, Arial, Helvetica, sans-serif"