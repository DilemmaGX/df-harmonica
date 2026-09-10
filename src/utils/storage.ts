import type { Language, Note, ThemeMode, Track } from '../types'

// ============================================================================
// 常量
// ============================================================================

const STORAGE_KEY = 'df-harmonica:state'

/**
 * 当前代码期望的存储版本。
 * - 首次引入持久化时 = 1
 * - 未来新增迁移时 +1
 */
export const STORAGE_VERSION = 1

// ============================================================================
// 当前版本的存储结构
// ============================================================================

export interface PersistedState {
  track: Track
  language: Language
  themeMode: ThemeMode
}

// ============================================================================
// 迁移定义
//
// 当前 v1 是首个版本，没有任何历史迁移，MIGRATIONS 为空。
//
// 未来新增版本（v1 → v2）时的步骤：
//   1. 写一个 migrationV1toV2，接收旧结构、返回新结构（含 version: 2）
//   2. 把它追加到 MIGRATIONS 数组末尾
//   3. 把 STORAGE_VERSION +1
//   4. 按需更新 PersistedState 类型
//
// 迁移函数必须：
//   - 输入输出都是「完整对象」
//   - 返回值包含推进后的 version
//   - 对缺失 / 异常字段给默认值，不要抛错（抛错会被外层捕获并清空存储）
// ============================================================================

interface MigrationEntry {
  from: number
  to: number
  migrate: (raw: any) => any
}

/** 迁移链：追加新条目即可，无需修改其他代码 */
const MIGRATIONS: MigrationEntry[] = []

// ============================================================================
// 底层 IO
// ============================================================================

function readRaw(): any | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    // JSON 损坏 → 直接清空，让上层用默认值重新开始
    clearState()
    return null
  }
}

// ============================================================================
// 版本检测
// ============================================================================

/**
 * 提取数据版本号。
 * - 有 `version` 数字字段 → 使用它
 * - 没有 → 视为 v1（当前唯一已知的历史版本）
 */
function detectVersion(raw: any): number {
  if (!raw || typeof raw !== 'object') return 1
  return typeof raw.version === 'number' ? raw.version : 1
}

// ============================================================================
// 迁移流水线
// ============================================================================

/**
 * 逐级执行迁移，直到追上 STORAGE_VERSION。
 * 任何异常 / 缺迁移 / 版本不前进 → 清空存储并返回 null。
 */
function migrate(raw: any): any | null {
  const startVersion = detectVersion(raw)

  // 数据比代码更新（用户降级了应用）→ 清空，避免用旧代码解析新结构
  if (startVersion > STORAGE_VERSION) {
    clearState()
    return null
  }

  let cursor = raw
  let version = startVersion

  while (version < STORAGE_VERSION) {
    const step = MIGRATIONS.find(m => m.from === version)
    if (!step) {
      // 找不到该版本的迁移路径 → 无法安全升级 → 清空
      clearState()
      return null
    }

    try {
      cursor = step.migrate(cursor)
    } catch {
      // 迁移抛错 → 数据不可修复 → 清空
      clearState()
      return null
    }

    const nextVersion = detectVersion(cursor)
    if (nextVersion <= version) {
      // 迁移没有推进版本 → 视为错误
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
      typeof t.bpm === 'number' && t.bpm >= 40 && t.bpm <= 240
        ? t.bpm
        : 120,
    beatsPerBar:
      typeof t.beatsPerBar === 'number' &&
      t.beatsPerBar >= 1 &&
      t.beatsPerBar <= 12
        ? t.beatsPerBar
        : 4,
  }
}

/**
 * 对迁移后的数据做最终校验，保证返回的类型严格等于 PersistedState。
 * 部分损坏（如 language 字段丢失）会被就地修复，而不是整体丢弃。
 */
function normalize(raw: any): PersistedState | null {
  const data = raw?.data
  if (!data || typeof data !== 'object') return null

  const themeModes: ThemeMode[] = ['light', 'dark', 'system']

  return {
    track: normalizeTrack(data.track),
    language: data.language === 'en' ? 'en' : 'zh',
    themeMode: themeModes.includes(data.themeMode) ? data.themeMode : 'system',
  }
}

// ============================================================================
// 公共 API
// ============================================================================

/**
 * 从 localStorage 读取状态。自动处理：
 * - JSON 损坏 / 缺迁移 / 迁移异常 → 清空并返回 null
 * - 跨多版本迁移（未来）
 * - 字段规范化与校验
 * - 数据版本高于代码版本时的降级保护
 *
 * 返回 null 时，调用方应使用默认值初始化。
 */
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

/**
 * 写入当前状态，附带版本号。
 * 任何 IO 异常（配额满、隐私模式）均静默忽略。
 */
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

/**
 * 清除持久化数据。
 */
export function clearState(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
}