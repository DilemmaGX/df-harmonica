import qrcode from 'qrcode-generator'

export interface QRMatrix {
  size: number
  /** modules[row][col] === true 表示该模块需要绘制 */
  modules: boolean[][]
}

/**
 * 生成二维码模块矩阵。
 * 若数据超出 QR 版本 40-L 的容量，返回 null。
 */
export function createQRMatrix(text: string): QRMatrix | null {
  try {
    const qr = qrcode(0, 'L') // typeNumber 0 = 自动选择，纠错级别 L
    qr.addData(text)
    qr.make()
    const size = qr.getModuleCount()
    const modules: boolean[][] = []
    for (let row = 0; row < size; row++) {
      const r: boolean[] = []
      for (let col = 0; col < size; col++) {
        r.push(qr.isDark(row, col))
      }
      modules.push(r)
    }
    return { size, modules }
  } catch {
    return null
  }
}

/**
 * 将矩阵渲染为 SVG path 的 d 属性字符串。
 * 使用单条 path 比逐模块 <rect> 体积更小。
 */
export function qrMatrixToPath(
  m: QRMatrix,
  x: number,
  y: number,
  pixelSize: number,
): string {
  const cell = pixelSize / m.size
  const parts: string[] = []
  for (let row = 0; row < m.size; row++) {
    for (let col = 0; col < m.size; col++) {
      if (m.modules[row][col]) {
        const rx = (x + col * cell).toFixed(3)
        const ry = (y + row * cell).toFixed(3)
        const rs = cell.toFixed(3)
        parts.push(`M${rx} ${ry}h${rs}v${rs}h-${rs}z`)
      }
    }
  }
  return parts.join('')
}