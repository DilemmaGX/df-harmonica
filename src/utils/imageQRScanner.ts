import jsQR from 'jsqr'
import {
  parseProjectFile,
  decodeProjectFromQR,
} from './projectFormat'
import type { ProjectFile } from '../types'

/** 图像栅格化后的最大边长（像素）。超过此值会按比例缩放，兼顾内存与识别率。 */
const MAX_DIMENSION = 2200

/** 尝试的缩放比例列表 */
const RETRY_SCALES = [1, 1.5, 2, 3]

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

function rasterize(
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

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, w, h)
  ctx.drawImage(img, 0, 0, w, h)

  try {
    return ctx.getImageData(0, 0, w, h)
  } catch {
    return null
  }
}

/**
 * 从图片中提取项目数据（仅二维码路径）。
 */
export async function extractProjectFromImageFile(
  file: File,
): Promise<ProjectFile | null> {
  let img: HTMLImageElement
  try {
    img = await loadImageFromFile(file)
  } catch {
    return null
  }

  for (const scale of RETRY_SCALES) {
    const imageData = rasterize(img, scale)
    if (!imageData) continue
    try {
      const result = jsQR(
        imageData.data,
        imageData.width,
        imageData.height,
        { inversionAttempts: 'attemptBoth' },
      )
      if (result && result.data) {
        const text = result.data
        const compact = decodeProjectFromQR(text)
        if (compact) return compact
        const json = parseProjectFile(text)
        if (json) return json
      }
    } catch {
      // 继续下一个缩放比例
    }
  }

  return null
}

/**
 * 从上传的图片中扫描二维码文本（保留兼容）。
 */
export async function scanImageForQR(file: File): Promise<string | null> {
  let img: HTMLImageElement
  try {
    img = await loadImageFromFile(file)
  } catch {
    return null
  }

  for (const scale of RETRY_SCALES) {
    const imageData = rasterize(img, scale)
    if (!imageData) continue
    try {
      const result = jsQR(
        imageData.data,
        imageData.width,
        imageData.height,
        { inversionAttempts: 'attemptBoth' },
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