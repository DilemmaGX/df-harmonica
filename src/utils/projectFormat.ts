import type {
  HarmonicaKey,
  Note,
  OctaveShift,
  ProjectFile,
  ProjectMeta,
  Track,
} from '../types'
import { KEY_ORDER } from './noteMapping'

export const PROJECT_FILE_FORMAT = 'df-harmonica-project' as const
export const PROJECT_FILE_VERSION = 1 as const

export const DEFAULT_META: ProjectMeta = {
  title: '',
  composer: '',
  transcriber: '',
}

function clampBpm(v: unknown): number {
  return typeof v === 'number' && v >= 40 && v <= 240 ? v : 120
}

function clampBeatsPerBar(v: unknown): number {
  return typeof v === 'number' && v >= 1 && v <= 12 ? v : 4
}

function isValidNote(n: any): boolean {
  return (
    n &&
    typeof n === 'object' &&
    typeof n.startBeat === 'number' &&
    typeof n.durationBeats === 'number' &&
    typeof n.key === 'string' &&
    KEY_ORDER.includes(n.key) &&
    (n.octaveShift === -1 || n.octaveShift === 0 || n.octaveShift === 1) &&
    typeof n.isSharp === 'boolean'
  )
}

function normalizeNote(n: any, idx: number): Note {
  return {
    id: typeof n.id === 'string' ? n.id : `note-imp-${Date.now()}-${idx}`,
    startBeat: Math.max(0, n.startBeat),
    durationBeats: Math.max(0.25, n.durationBeats),
    key: n.key as HarmonicaKey,
    octaveShift: n.octaveShift as OctaveShift,
    isSharp: Boolean(n.isSharp),
  }
}

// ---------------------------------------------------------------------------
// 工程文件（JSON）—— 用于上传/下载
// ---------------------------------------------------------------------------

export function createProjectFile(track: Track, meta: ProjectMeta): ProjectFile {
  return {
    format: PROJECT_FILE_FORMAT,
    version: PROJECT_FILE_VERSION,
    meta: {
      title: meta.title ?? '',
      composer: meta.composer ?? '',
      transcriber: meta.transcriber ?? '',
    },
    track: {
      bpm: track.bpm,
      beatsPerBar: track.beatsPerBar,
      notes: track.notes.map(n => ({ ...n })),
    },
  }
}

export function serializeProjectFile(project: ProjectFile): string {
  return JSON.stringify(project, null, 2)
}

export function parseProjectFile(text: string): ProjectFile | null {
  try {
    const data = JSON.parse(text)
    if (!data || typeof data !== 'object') return null
    if (data.format !== PROJECT_FILE_FORMAT) return null
    if (data.version !== PROJECT_FILE_VERSION) return null

    const meta: ProjectMeta = {
      title: typeof data.meta?.title === 'string' ? data.meta.title : '',
      composer:
        typeof data.meta?.composer === 'string' ? data.meta.composer : '',
      transcriber:
        typeof data.meta?.transcriber === 'string'
          ? data.meta.transcriber
          : '',
    }

    const trackRaw = data.track
    if (!trackRaw || typeof trackRaw !== 'object') return null

    const notes: Note[] = Array.isArray(trackRaw.notes)
      ? trackRaw.notes.filter(isValidNote).map(normalizeNote)
      : []

    return {
      format: PROJECT_FILE_FORMAT,
      version: PROJECT_FILE_VERSION,
      meta,
      track: {
        notes,
        bpm: clampBpm(trackRaw.bpm),
        beatsPerBar: clampBeatsPerBar(trackRaw.beatsPerBar),
      },
    }
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// 紧凑编码 —— 用于二维码
//
// 格式：DFH1|title_b64|composer_b64|transcriber_b64|bpm36|bpb36|notes
//   title / composer / transcriber：UTF-8 文本的 base64url
//   bpm / beatsPerBar：base36 整数
//   notes：逗号分隔，每个音符形如 `<start36>.<dur36>.<kom36>`
//     start / dur：单位为十六分音符（beat*4）的 base36 整数
//     kom = keyIndex * 6 + (octaveShift + 1) * 2 + isSharp
// ---------------------------------------------------------------------------

const B64_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

function utf8ToBase64Url(s: string): string {
  const bytes = new TextEncoder().encode(s)
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i]
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0
    out += B64_ALPHABET[b0 >> 2]
    out += B64_ALPHABET[((b0 & 0x03) << 4) | (b1 >> 4)]
    out +=
      i + 1 < bytes.length
        ? B64_ALPHABET[((b1 & 0x0f) << 2) | (b2 >> 6)]
        : ''
    out += i + 2 < bytes.length ? B64_ALPHABET[b2 & 0x3f] : ''
  }
  return out
}

function base64UrlToUtf8(s: string): string {
  const lookup: Record<string, number> = {}
  for (let i = 0; i < B64_ALPHABET.length; i++) lookup[B64_ALPHABET[i]] = i

  const bytes: number[] = []
  let buffer = 0
  let bits = 0
  for (const ch of s) {
    const v = lookup[ch]
    if (v === undefined) continue
    buffer = (buffer << 6) | v
    bits += 6
    if (bits >= 8) {
      bits -= 8
      bytes.push((buffer >> bits) & 0xff)
    }
  }
  return new TextDecoder().decode(new Uint8Array(bytes))
}

export function encodeProjectForQR(project: ProjectFile): string {
  const notesStr = project.track.notes
    .map(n => {
      const s = Math.max(0, Math.round(n.startBeat * 4))
      const d = Math.max(1, Math.round(n.durationBeats * 4))
      const k = Math.max(0, KEY_ORDER.indexOf(n.key))
      const o = n.octaveShift + 1 // 0..2
      const h = n.isSharp ? 1 : 0
      const kom = k * 6 + o * 2 + h // 0..47
      return `${s.toString(36)}.${d.toString(36)}.${kom.toString(36)}`
    })
    .join(',')

  return [
    'DFH1',
    utf8ToBase64Url(project.meta.title || ''),
    utf8ToBase64Url(project.meta.composer || ''),
    utf8ToBase64Url(project.meta.transcriber || ''),
    project.track.bpm.toString(36),
    project.track.beatsPerBar.toString(36),
    notesStr,
  ].join('|')
}

export function decodeProjectFromQR(text: string): ProjectFile | null {
  try {
    const trimmed = text.trim()
    if (!trimmed.startsWith('DFH1|')) return null
    const parts = trimmed.split('|')
    if (parts.length < 7) return null

    const [, titleB64, composerB64, transcriberB64, bpm36, bpb36, notesStr] =
      parts

    const meta: ProjectMeta = {
      title: base64UrlToUtf8(titleB64),
      composer: base64UrlToUtf8(composerB64),
      transcriber: base64UrlToUtf8(transcriberB64),
    }

    const bpm = parseInt(bpm36, 36)
    const beatsPerBar = parseInt(bpb36, 36)

    const notes: Note[] = []
    if (notesStr.length > 0) {
      const chunks = notesStr.split(',')
      chunks.forEach((chunk, idx) => {
        const bits = chunk.split('.')
        if (bits.length !== 3) return
        const [s, d, kom] = bits

        const sNum = parseInt(s, 36)
        const dNum = parseInt(d, 36)
        const komNum = parseInt(kom, 36)

        if (
          !Number.isFinite(sNum) ||
          !Number.isFinite(dNum) ||
          !Number.isFinite(komNum) ||
          komNum < 0 ||
          komNum > 47
        ) {
          return
        }

        const kNum = Math.floor(komNum / 6)
        const rem = komNum % 6
        const oNum = Math.floor(rem / 2) - 1
        const hNum = rem % 2

        if (kNum < 0 || kNum >= KEY_ORDER.length) return
        if (oNum !== -1 && oNum !== 0 && oNum !== 1) return

        notes.push({
          id: `note-qr-${idx}`,
          startBeat: sNum / 4,
          durationBeats: dNum / 4,
          key: KEY_ORDER[kNum],
          octaveShift: oNum as OctaveShift,
          isSharp: hNum === 1,
        })
      })
    }

    return {
      format: PROJECT_FILE_FORMAT,
      version: PROJECT_FILE_VERSION,
      meta,
      track: {
        notes,
        bpm: Number.isFinite(bpm) ? clampBpm(bpm) : 120,
        beatsPerBar: Number.isFinite(beatsPerBar)
          ? clampBeatsPerBar(beatsPerBar)
          : 4,
      },
    }
  } catch {
    return null
  }
}