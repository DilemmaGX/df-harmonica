import jsQR from 'jsqr'

/** 图像栅格化后的最大边长（像素）。超过此值会按比例缩放，兼顾内存与识别率。 */
const MAX_DIMENSION = 2200

/** 识别失败时，尝试在多个缩放比例下重新扫描。 */
const RETRY_SCALES = [1, 1.5, 2]

function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('image-load-failed'))
    }
    img.src = url
  })
}

function extractImageData(
  img: HTMLImageElement,
  scale: number,
): ImageData | null {
  const naturalW = img.naturalWidth || img.width
  const naturalH = img.naturalHeight || img.height
  if (naturalW === 0 || naturalH === 0) return null

  let w = naturalW * scale
  let h = naturalH * scale
  const longest = Math.max(w, h)
  if (longest > MAX_DIMENSION) {
    const ratio = MAX_DIMENSION / longest
    w *= ratio
    h *= ratio
  }
  w = Math.max(1, Math.round(w))
  h = Math.max(1, Math.round(h))

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null

  // 铺白底：PNG 的透明区域或深色背景可能在阈值化时干扰识别
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, w, h)
  ctx.drawImage(img, 0, 0, w, h)

  try {
    return ctx.getImageData(0, 0, w, h)
  } catch {
    // 极少数情况下（例如外部引用的 SVG 资源）会因画布被污染而抛错
    return null
  }
}

/**
 * 从上传的图片中扫描二维码文本。
 *
 * 支持 PNG / JPG / SVG 等浏览器可解码的图像格式。
 * 返回二维码中的原始字符串；未检测到二维码或图像无法解码时返回 null。
 */
export async function scanImageForQR(file: File): Promise<string | null> {
  let img: HTMLImageElement
  try {
    img = await loadImageFromFile(file)
  } catch {
    return null
  }

  for (const scale of RETRY_SCALES) {
    const imageData = extractImageData(img, scale)
    if (!imageData) continue
    try {
      const result = jsQR(
        imageData.data,
        imageData.width,
        imageData.height,
        {
          // 提升在复杂背景上的鲁棒性
          inversionAttempts: 'attemptBoth',
        },
      )
      if (result && result.data) {
        return result.data
      }
    } catch {
      // 继续下一个缩放比例
    }
  }

  return null
}