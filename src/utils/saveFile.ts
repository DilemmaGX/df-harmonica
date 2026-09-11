import { isTauriEnvironment } from './env'

/**
 * 统一的文件保存工具。
 *
 * - 在 Tauri 环境中：弹出系统保存对话框，用户选择路径后由 Rust 命令写入。
 * - 在浏览器环境中：走 `<a download>` 静默下载（行为与之前保持一致）。
 */

export interface SaveFileFilter {
  name: string
  extensions: string[]
}

export interface SaveFileOptions {
  /** 默认文件名（含扩展名） */
  defaultFileName: string
  /** 文件类型过滤器（Tauri / 浏览器均支持） */
  filters?: SaveFileFilter[]
  /** 浏览器端使用的 MIME 类型（Tauri 端忽略） */
  mimeType?: string
}

/**
 * 保存文件。返回 true 表示成功（或已发起浏览器下载），
 * 返回 false 表示用户在保存对话框中取消了操作。
 */
export async function saveFile(
  data: Uint8Array | Blob | string,
  options: SaveFileOptions,
): Promise<boolean> {
  if (isTauriEnvironment()) {
    return saveViaTauri(data, options)
  }
  return saveViaBrowser(data, options)
}

async function saveViaTauri(
  data: Uint8Array | Blob | string,
  options: SaveFileOptions,
): Promise<boolean> {
  const { save } = await import('@tauri-apps/plugin-dialog')
  const { invoke } = await import('@tauri-apps/api/core')

  const path = await save({
    defaultPath: options.defaultFileName,
    filters: options.filters,
  })

  if (!path) return false

  let contents: number[]
  if (typeof data === 'string') {
    contents = Array.from(new TextEncoder().encode(data))
  } else if (data instanceof Uint8Array) {
    contents = Array.from(data)
  } else {
    const buffer = new Uint8Array(await data.arrayBuffer())
    contents = Array.from(buffer)
  }

  await invoke('save_file', { path, contents })
  return true
}

async function saveViaBrowser(
  data: Uint8Array | Blob | string,
  options: SaveFileOptions,
): Promise<boolean> {
  const blob = toBlob(data, options.mimeType)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = options.defaultFileName
  a.click()
  URL.revokeObjectURL(url)
  return true
}

function toBlob(
  data: Uint8Array | Blob | string,
  mimeType?: string,
): Blob {
  if (data instanceof Blob) return data
  if (typeof data === 'string') {
    return new Blob([data], { type: mimeType ?? 'text/plain;charset=utf-8' })
  }
  const buffer = data.buffer.slice(
    data.byteOffset,
    data.byteOffset + data.byteLength,
  ) as ArrayBuffer
  return new Blob([buffer], { type: mimeType ?? 'application/octet-stream' })
}