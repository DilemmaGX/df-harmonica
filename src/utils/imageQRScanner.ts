import jsQR from 'jsqr'
import { parseProjectFile, decodeProjectFromQR } from './projectFormat'
import type { ProjectFile } from '../types'

/** 全图栅格化后的最大边长（像素）。超过此值会按比例缩放，兼顾内存与识别率。 */
const MAX_DIMENSION = 2200

/** 全图扫描时尝试的缩放比例列表。 */
const RETRY_SCALES = [1, 1.5, 2, 3]

/**
 * 瓦片扫描：把原图按网格切成互相重叠的小块，逐块放大后再喂给 jsQR。
 *
 * 之所以有效：二维码在整张图中占比过小时，jsQR 的定位阶段无法从大量
 * 背景模块中分辨出三个定位图案；把它所在的局部区域单独放大后，
 * 二维码在「看到的画面」里重新占据主导，识别率会大幅提高。
 */
const TILE_DIVISIONS = [2, 3, 4]

/** 相邻瓦片之间的重叠比例，避免二维码恰好被切在两个瓦片的接缝上。 */
const TILE_OVERLAP_RATIO = 0.25

/** 瓦片扫描时，把瓦片最长边放大到的目标尺寸。 */
const TILE_SCAN_LONGEST = 1600

/** 瓦片放大倍数上限，防止把小块区域拉得过大导致耗时陡增。 */
const MAX_TILE_UPSCALE = 4

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

interface Region {
  x: number
  y: number
  w: number
  h: number
}

/**
 * 等比计算栅格化后的画布尺寸。
 * 长边超过 MAX_DIMENSION 时按比例缩回，避免生成过大的 ImageData。
 */
function computeRasterSize(
  naturalW: number,
  naturalH: number,
  scale: number,
): { w: number; h: number } {
  let w = naturalW * scale
  let h = naturalH * scale
  const longest = Math.max(w, h)
  if (longest > MAX_DIMENSION) {
    const ratio = MAX_DIMENSION / longest
    w *= ratio
    h *= ratio
  }
  return {
    w: Math.max(1, Math.round(w)),
    h: Math.max(1, Math.round(h)),
  }
}

/** 将源图的指定区域绘制到 canvas 上，并等比缩放到 outW × outH。 */
function drawRegion(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  region: Region,
  outW: number,
  outH: number,
): void {
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, outW, outH)
  ctx.drawImage(
    img,
    region.x,
    region.y,
    region.w,
    region.h,
    0,
    0,
    outW,
    outH,
  )
}

/** 解析二维码文本 → ProjectFile。支持紧凑编码与 JSON 两种格式。 */
function parseQRPayload(text: string): ProjectFile | null {
  const compact = decodeProjectFromQR(text)
  if (compact) return compact
  const json = parseProjectFile(text)
  if (json) return json
  return null
}

/**
 * 计算瓦片扫描列表。
 *
 * @param naturalW   原图宽
 * @param naturalH   原图高
 * @param divisions  网格划分数（2 = 2×2，3 = 3×3 ...）
 */
function buildTiles(
  naturalW: number,
  naturalH: number,
  divisions: number,
): Region[] {
  const tileW = naturalW / divisions
  const tileH = naturalH / divisions
  const padX = tileW * TILE_OVERLAP_RATIO
  const padY = tileH * TILE_OVERLAP_RATIO

  const tiles: Region[] = []
  for (let row = 0; row < divisions; row++) {
    for (let col = 0; col < divisions; col++) {
      const x = Math.max(0, col * tileW - padX)
      const y = Math.max(0, row * tileH - padY)
      const w = Math.min(naturalW - x, tileW + padX * 2)
      const h = Math.min(naturalH - y, tileH + padY * 2)
      tiles.push({ x, y, w, h })
    }
  }
  return tiles
}

/**
 * 对指定区域做一次栅格化 + 解码尝试。
 * 返回命中的 ProjectFile；未命中或区域非法返回 null。
 */
function scanRegion(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  region: Region,
  outW: number,
  outH: number,
): ProjectFile | null {
  if (region.w <= 0 || region.h <= 0 || outW <= 0 || outH <= 0) return null

  canvas.width = outW
  canvas.height = outH
  drawRegion(ctx, img, region, outW, outH)

  let imageData: ImageData
  try {
    imageData = ctx.getImageData(0, 0, outW, outH)
  } catch {
    return null
  }

  try {
    const result = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: 'attemptBoth',
    })
    if (result && result.data) {
      return parseQRPayload(result.data)
    }
  } catch {
    // 忽略，继续下一个候选区域
  }
  return null
}

/**
 * 从图片中提取项目数据（仅二维码路径）。
 *
 * 识别流程：
 *   1. 全图扫描：对整张图按多种缩放比例尝试一次。
 *      覆盖「二维码在画面中占比较大」的常见场景，速度最快。
 *   2. 瓦片扫描：若第 1 步未命中，则将图片切成带重叠的瓦片网格
 *      （2×2 → 3×3 → 4×4），把每块单独放大到 TILE_SCAN_LONGEST
 *      再解码。此时二维码在「视野」中的相对尺寸被显著放大，
 *      相当于自动完成了用户手动 crop 后再识别的过程，
 *      从而解决「二维码在整张图中过小无法识别」的问题。
 *
 * 注意：此逻辑仅改变识别阶段的取景方式，不修改二维码的生成逻辑，
 * 因此所有既有二维码的兼容性完全不受影响。
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

  const naturalW = img.naturalWidth || img.width
  const naturalH = img.naturalHeight || img.height
  if (naturalW === 0 || naturalH === 0) return null

  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null

  // ------------------------------------------------------------------
  // 第 1 步：全图扫描（含多种缩放比例）
  // ------------------------------------------------------------------
  for (const scale of RETRY_SCALES) {
    const { w, h } = computeRasterSize(naturalW, naturalH, scale)
    const project = scanRegion(
      canvas,
      ctx,
      img,
      { x: 0, y: 0, w: naturalW, h: naturalH },
      w,
      h,
    )
    if (project) return project
  }

  // ------------------------------------------------------------------
  // 第 2 步：瓦片扫描 —— 把局部放大后识别
  // ------------------------------------------------------------------
  for (const divisions of TILE_DIVISIONS) {
    const tiles = buildTiles(naturalW, naturalH, divisions)
    for (const tile of tiles) {
      const longest = Math.max(tile.w, tile.h)
      // 目标：把瓦片长边放大到 TILE_SCAN_LONGEST，同时限制放大倍数上限
      const scale = Math.min(TILE_SCAN_LONGEST / longest, MAX_TILE_UPSCALE)
      const outW = Math.max(1, Math.round(tile.w * scale))
      const outH = Math.max(1, Math.round(tile.h * scale))

      const project = scanRegion(canvas, ctx, img, tile, outW, outH)
      if (project) return project
    }
  }

  return null
}