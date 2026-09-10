import type {
  Language,
  Note,
  ProjectMeta,
  ThemeMode,
  Track,
} from '../types'

// ============================================================================
// 常量
// ============================================================================

const STORAGE_KEY = 'df-harmonica:state'

/**
 * 当前代码期望的存储版本。
 * - v1：最初的持久化版本，只包含 track / language / themeMode
 * - v2：新增 meta（标题 / 作曲者 / 制谱者）
 */
export const STORAGE_VERSION = 2

// ============================================================================
// 当前版本的存储结构
// ============================================================================

export interface PersistedState {
  track: Track
  meta: ProjectMeta
  language: Language
  themeMode: ThemeMode
}

export const DEFAULT_META: ProjectMeta = {
  title: '',
  composer: '',
  transcriber: '',
}

// ============================================================================
// 迁移定义
//
// 未来新增版本（v2 → v3）时的步骤：
//   1. 写一个 migrationV2toV3，接收旧结构、返回新结构（含 version: 3）
//   2. 把它追加到 MIGRATIONS 数组末尾
//   3. 把 STORAGE_VERSION +1
//   4. 按需更新 PersistedState 类型
// ============================================================================

interface MigrationEntry {
  from: number
  to: number
  migrate: (raw: any) => any
}

/** v1 → v2：新增空的 meta 字段 */
const migrationV1toV2 = (raw: any): any => {
  const data = raw?.data && typeof raw.data === 'object' ? raw.data : {}
  return {
    version: 2,
    data: {
      ...data,
      meta: {
        title: '',
        composer: '',
        transcriber: '',
      },
    },
  }
}

const MIGRATIONS: MigrationEntry[] = [
  { from: 1, to: 2, migrate: migrationV1toV2 },
]

// ============================================================================
// 底层 IO
// ============================================================================

function readRaw(): any | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    clearState()
    return null
  }
}

// ============================================================================
// 版本检测
// ============================================================================

function detectVersion(raw: any): number {
  if (!raw || typeof raw !== 'object') return 1
  return typeof raw.version === 'number' ? raw.version : 1
}

// ============================================================================
// 迁移流水线
// ============================================================================

function migrate(raw: any): any | null {
  const startVersion = detectVersion(raw)

  // 数据比代码更新 → 清空，避免用旧代码解析新结构
  if (startVersion > STORAGE_VERSION) {
    clearState()
    return null
  }

  let cursor = raw
  let version = startVersion

  while (version < STORAGE_VERSION) {
    const step = MIGRATIONS.find(m => m.from === version)
    if (!step) {
      clearState()
      return null
    }

    try {
      cursor = step.migrate(cursor)
    } catch {
      clearState()
      return null
    }

    const nextVersion = detectVersion(cursor)
    if (nextVersion <= version) {
      clearState()
      return null
    }
    version = nextVersion
  }

  return cursor
}

// ============================================================================
// 规范化 / 校验
// ============================================================================

function isValidNote(n: any): n is Note {
  return (
    n &&
    typeof n === 'object' &&
    typeof n.id === 'string' &&
    typeof n.startBeat === 'number' &&
    typeof n.durationBeats === 'number' &&
    typeof n.key === 'string' &&
    (n.octaveShift === -1 || n.octaveShift === 0 || n.octaveShift === 1) &&
    typeof n.isSharp === 'boolean'
  )
}

function normalizeTrack(raw: any): Track {
  const t = raw && typeof raw === 'object' ? raw : {}
  return {
    notes: Array.isArray(t.notes) ? t.notes.filter(isValidNote) : [],
    bpm:
      typeof t.bpm === 'number' && t.bpm >= 40 && t.bpm <= 240 ? t.bpm : 120,
    beatsPerBar:
      typeof t.beatsPerBar === 'number' &&
      t.beatsPerBar >= 1 &&
      t.beatsPerBar <= 12
        ? t.beatsPerBar
        : 4,
  }
}

function normalizeMeta(raw: any): ProjectMeta {
  const m = raw && typeof raw === 'object' ? raw : {}
  return {
    title: typeof m.title === 'string' ? m.title : '',
    composer: typeof m.composer === 'string' ? m.composer : '',
    transcriber: typeof m.transcriber === 'string' ? m.transcriber : '',
  }
}

function normalize(raw: any): PersistedState | null {
  const data = raw?.data
  if (!data || typeof data !== 'object') return null

  const themeModes: ThemeMode[] = ['light', 'dark', 'system']

  return {
    track: normalizeTrack(data.track),
    meta: normalizeMeta(data.meta),
    language: data.language === 'en' ? 'en' : 'zh',
    themeMode: themeModes.includes(data.themeMode) ? data.themeMode : 'system',
  }
}

// ============================================================================
// 公共 API
// ============================================================================

export function loadState(): PersistedState | null {
  const raw = readRaw()
  if (!raw) return null

  const migrated = migrate(raw)
  if (!migrated) return null

  const normalized = normalize(migrated)
  if (!normalized) {
    clearState()
    return null
  }

  return normalized
}

export function saveState(state: PersistedState): void {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: STORAGE_VERSION, data: state }),
    )
  } catch {
    // ignore
  }
}

export function clearState(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
}