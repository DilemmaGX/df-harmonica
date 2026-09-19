import type { Note } from '../types'
import { getMidiNote } from './noteMapping'

/**
 * 难度评级结果。
 */
export interface DifficultyResult {
  /** 1–5 整数档，用于 UI 显示与颜色分档 */
  level: number
  /** 1.0–5.0 保留一位小数的原始分 */
  score: number
}

/**
 * 计算一个未归一化的原始难度分数。
 *
 * 返回值的绝对大小没有意义，只有相对大小有意义——它的作用仅仅是给
 * 一批曲目提供一个排序依据。之所以不做归一化，是因为不同曲目集合
 * 的取值范围差异很大，硬编码的归一化区间会把所有结果都挤到中间，
 * 这正是早期版本「全部算成 3」的根本原因。
 *
 * 权重设计：
 *   - nps（每秒音符数）是绝对主力，它同时包含了速度与疏密两个维度；
 *   - shortRatio（短音符比例）次之，快速跑动比慢速跑动更难；
 *   - log(bpm) 作为基础速度因子，用对数是为了避免极端速度过度拉分；
 *   - 跳进 / 音域 / 修饰音占比作为补充，权重较低。
 */
export function computeRawDifficulty(notes: Note[], bpm: number): number {
  if (notes.length === 0) return 0

  const sorted = [...notes].sort((a, b) => a.startBeat - b.startBeat)
  const last = sorted[sorted.length - 1]
  const totalBeats = Math.max(1, last.startBeat + last.durationBeats)
  const durationSeconds = Math.max(0.1, (totalBeats * 60) / bpm)

  // 每秒音符数
  const nps = notes.length / durationSeconds

  // 短音符比例（时长 ≤ 1/2 拍）
  const shortCount = notes.filter(n => n.durationBeats <= 0.5).length
  const shortRatio = shortCount / notes.length

  // 音域
  const midiValues = notes.map(n =>
    getMidiNote(n.key, n.octaveShift, n.isSharp),
  )
  const midiRange =
    Math.max(...midiValues) - Math.min(...midiValues)

  // 平均跳进
  let leapSum = 0
  for (let i = 1; i < midiValues.length; i++) {
    leapSum += Math.abs(midiValues[i] - midiValues[i - 1])
  }
  const avgLeap =
    midiValues.length > 1 ? leapSum / (midiValues.length - 1) : 0

  // 修饰键占比
  const modifierCount = notes.filter(
    n => n.isSharp || n.octaveShift !== 0,
  ).length
  const modifiers = modifierCount / notes.length

  return (
    nps * 2.0 +
    shortRatio * 1.5 +
    Math.log2(bpm / 60) * 1.0 +
    (avgLeap / 4) * 0.5 +
    (midiRange / 12) * 0.3 +
    modifiers * 0.5
  )
}

/**
 * 给定一组原始分数，构建一个把任意原始分数映射到 1–5 等级的函数。
 *
 * 分配规则：把每个分数在「已排序的原始分数列表」中的名次映射到
 * [0, 1]，再线性映射到 [1, 5]。这样：
 *   - 列表里最低的分数 → 1
 *   - 列表里最高的分数 → 5
 *   - 其余分数按名次均匀分布
 *
 * 相比绝对阈值方案的优势：
 *   - 无论原始分数如何聚拢，输出都会覆盖 1–5 的完整范围；
 *   - 不需要手工调阈值，换一批曲目自动重算；
 *   - 相同的原始分数会得到相同的等级（并列）。
 */
export function buildDifficultyMapper(
  rawScores: number[],
): (raw: number) => DifficultyResult {
  const sorted = [...rawScores].sort((a, b) => a - b)
  const N = sorted.length

  return (raw: number): DifficultyResult => {
    // 没有参照样本 → 返回中间档
    if (N <= 1) return { level: 3, score: 3 }

    // 二分查找：统计有多少个样本严格小于 raw
    let lo = 0
    let hi = N
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (sorted[mid] < raw) lo = mid + 1
      else hi = mid
    }
    const rank = lo

    // 名次 → 百分位
    const pct = rank / (N - 1)

    // 百分位 → [1, 5]
    const score = Math.min(5, Math.max(1, 1 + pct * 4))
    const level = Math.max(1, Math.min(5, Math.round(score)))

    return {
      level,
      score: Math.round(score * 10) / 10,
    }
  }
}