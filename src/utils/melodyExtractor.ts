import type { Note } from '../types'
import { getMidiNote } from './noteMapping'
import { DURATION_QUANTUM } from './projectFormat'

/**
 * 旋律提取算法。输入是可能包含和弦（同时发声）的音符列表，
 * 输出是单声部的旋律音符列表。
 *
 * 所有算法的输出都保证：
 *   - 严格互不重叠
 *   - 起始拍与音长都落在 1/4 拍网格上
 *   - 音长不少于 1/4 拍
 *   - 保留原始音高信息（key / octaveShift / isSharp），不做按键重映射
 *
 * 关于「非法音长」（例如 1/3 拍）的处理方式见 `quantizeMelody`。
 */
export type MelodyAlgorithm = 'skyline' | 'top' | 'bottom' | 'longest'

export const MELODY_ALGORITHMS: MelodyAlgorithm[] = [
  'skyline',
  'top',
  'bottom',
  'longest',
]

interface ChordGroup {
  notes: Note[]
  startBeat: number
  endBeat: number
}

/**
 * 把音符按重叠关系分组成和弦。
 *
 * 判定规则：按起始拍排序后顺序扫描，若某音符的开始时间严格早于
 * 当前组已扩展到的最晚结束时间，则它属于当前组；否则另起一组。
 * 相邻但不重叠的音符（首尾相接）会被分到不同的组。
 */
function groupIntoChords(notes: Note[]): ChordGroup[] {
  if (notes.length === 0) return []
  const sorted = [...notes].sort((a, b) => a.startBeat - b.startBeat)
  const groups: ChordGroup[] = []

  let current: ChordGroup | null = null
  for (const note of sorted) {
    const noteEnd = note.startBeat + note.durationBeats
    if (!current) {
      current = { notes: [note], startBeat: note.startBeat, endBeat: noteEnd }
      continue
    }
    if (note.startBeat < current.endBeat) {
      current.notes.push(note)
      if (noteEnd > current.endBeat) current.endBeat = noteEnd
    } else {
      groups.push(current)
      current = { notes: [note], startBeat: note.startBeat, endBeat: noteEnd }
    }
  }
  if (current) groups.push(current)
  return groups
}

function pickHighest(notes: Note[]): Note {
  let best = notes[0]
  let bestMidi = getMidiNote(best.key, best.octaveShift, best.isSharp)
  for (let i = 1; i < notes.length; i++) {
    const m = getMidiNote(notes[i].key, notes[i].octaveShift, notes[i].isSharp)
    if (m > bestMidi) {
      best = notes[i]
      bestMidi = m
    }
  }
  return best
}

function pickLowest(notes: Note[]): Note {
  let best = notes[0]
  let bestMidi = getMidiNote(best.key, best.octaveShift, best.isSharp)
  for (let i = 1; i < notes.length; i++) {
    const m = getMidiNote(notes[i].key, notes[i].octaveShift, notes[i].isSharp)
    if (m < bestMidi) {
      best = notes[i]
      bestMidi = m
    }
  }
  return best
}

/** 取时值最长的音符；平局时取音高更高的那个（旋律通常在高声部） */
function pickLongest(notes: Note[]): Note {
  let best = notes[0]
  for (let i = 1; i < notes.length; i++) {
    const d = notes[i].durationBeats
    if (d > best.durationBeats) {
      best = notes[i]
    } else if (d === best.durationBeats) {
      const m = getMidiNote(notes[i].key, notes[i].octaveShift, notes[i].isSharp)
      const bm = getMidiNote(best.key, best.octaveShift, best.isSharp)
      if (m > bm) best = notes[i]
    }
  }
  return best
}

/**
 * 天际线（Skyline）算法。
 *
 * 把时间线按照所有音符的起止点切分成互不重叠的区间；在每个区间里
 * 取「正在发声的最高音」。相邻区间若选出的音高相同则合并为一条
 * 持续音。这是符号音乐旋律提取中广泛使用的最经典启发式方法，
 * 尤其适用于「和弦 + 上方主旋律」的流行/游戏配乐。
 */
function skyline(notes: Note[]): Note[] {
  if (notes.length === 0) return []

  const boundaries = new Set<number>()
  for (const n of notes) {
    boundaries.add(n.startBeat)
    boundaries.add(n.startBeat + n.durationBeats)
  }
  const times = [...boundaries].sort((a, b) => a - b)

  interface Segment {
    startBeat: number
    endBeat: number
    pitch: number
    source: Note
  }

  const segments: Segment[] = []
  for (let i = 0; i < times.length - 1; i++) {
    const t0 = times[i]
    const t1 = times[i + 1]
    if (t1 <= t0) continue

    let top: Note | null = null
    let topMidi = -Infinity
    for (const n of notes) {
      const nEnd = n.startBeat + n.durationBeats
      if (n.startBeat <= t0 && nEnd >= t1) {
        const m = getMidiNote(n.key, n.octaveShift, n.isSharp)
        if (m > topMidi) {
          topMidi = m
          top = n
        }
      }
    }
    if (top) {
      segments.push({
        startBeat: t0,
        endBeat: t1,
        pitch: topMidi,
        source: top,
      })
    }
  }

  // 合并相邻且同音高的片段
  const merged: Segment[] = []
  for (const seg of segments) {
    const last = merged[merged.length - 1]
    if (last && Math.abs(last.endBeat - seg.startBeat) < 1e-9) {
      if (last.pitch === seg.pitch) {
        last.endBeat = seg.endBeat
        continue
      }
    }
    merged.push({ ...seg })
  }

  return merged.map((m, idx) => ({
    id: `melody-skyline-${idx}-${Math.random().toString(36).slice(2, 6)}`,
    startBeat: m.startBeat,
    durationBeats: m.endBeat - m.startBeat,
    key: m.source.key,
    octaveShift: m.source.octaveShift,
    isSharp: m.source.isSharp,
  }))
}

/**
 * 和弦分组式算法：先把音符按重叠关系分成和弦组，每个组只保留
 * 一个音符，其开始 / 结束时值取整组的覆盖区间。
 */
function chordwise(notes: Note[], picker: (notes: Note[]) => Note): Note[] {
  const groups = groupIntoChords(notes)
  return groups.map((g, idx) => {
    const chosen = picker(g.notes)
    return {
      id: `melody-${idx}-${Math.random().toString(36).slice(2, 6)}`,
      startBeat: g.startBeat,
      durationBeats: Math.max(DURATION_QUANTUM, g.endBeat - g.startBeat),
      key: chosen.key,
      octaveShift: chosen.octaveShift,
      isSharp: chosen.isSharp,
    }
  })
}

/**
 * 把任意时值的旋律重新量化到 1/4 拍网格上。
 *
 * 这里刻意不做「就近吸附」。就近吸附会把每个 1/3 拍都变成 1/4 拍，
 * 于是整条旋律的时间轴会持续地向左漂移；而且在吸附之后还要靠
 * 「右推 / 延长 / 合并」之类的启发式修补，既破坏节奏又难以预测。
 *
 * 采用的方法：**最大覆盖栅格投票（maximum-coverage cell voting）**。
 *
 *   1. 以 1/4 拍为单位，把整条旋律的时间跨度栅格化为若干单元
 *      [k·Q, (k+1)·Q)。
 *   2. 对每个单元 c，遍历所有音符，统计它们在 c 内覆盖的时长，
 *      取覆盖时长最长（即「主导」该单元）的那个音符作为 c 的归属。
 *      这样，一个原本时长 1/3 拍的音符会自然地决定它跨越的两个
 *      单元里哪一个是它的「主场」。
 *   3. 把连续且属于同一个音符的单元合并成一个输出音符。
 *
 * 该方法的优势：
 *   - **总时长守恒**：输出的起点与终点都对齐到网格，从头到尾覆盖
 *     与输入完全相同的总时间跨度，不会出现「越量化越短」。
 *   - **旋律轮廓守恒**：每个时间位置保留的是当时占据最长时间的
 *     那个音高，因此不会出现某个音被莫名抹掉或前后挤成一团。
 *   - **无需要补丁式后处理**：输出天然无重叠、无碎小片段，
 *     不需要再引入「连音填充」「合并前一个音符」之类的启发式。
 *   - **对齐到网格是结果而非前提**：非法音长（如 1/3、1/5 拍）被
 *     重新「采样」为覆盖相同时间跨度的合法音长序列，而不是被简单
 *     地取整。
 *
 * 输出保证通过 `validateProjectFile`。
 */
function quantizeMelody(notes: Note[]): Note[] {
  if (notes.length === 0) return []

  const Q = DURATION_QUANTUM
  const EPS = 1e-6

  const sorted = [...notes].sort((a, b) => a.startBeat - b.startBeat)

  let totalEnd = 0
  for (const n of sorted) {
    totalEnd = Math.max(totalEnd, n.startBeat + n.durationBeats)
  }
  if (totalEnd <= EPS) return []

  // 用 1/4 拍为单位对时间线做栅格化
  const numCells = Math.max(1, Math.ceil(totalEnd / Q - EPS))

  // 对每个栅格单元，统计覆盖它时间最长的音符
  const owner: (Note | null)[] = new Array(numCells).fill(null)
  const coverage: number[] = new Array(numCells).fill(0)

  for (const note of sorted) {
    const start = Math.max(0, note.startBeat)
    const end = start + note.durationBeats
    const firstCell = Math.max(0, Math.floor(start / Q + EPS))
    const lastCell = Math.min(numCells, Math.ceil(end / Q - EPS))
    for (let c = firstCell; c < lastCell; c++) {
      const cellStart = c * Q
      const cellEnd = cellStart + Q
      const ovStart = Math.max(start, cellStart)
      const ovEnd = Math.min(end, cellEnd)
      const ov = ovEnd - ovStart
      if (ov > coverage[c] + EPS) {
        coverage[c] = ov
        owner[c] = note
      }
    }
  }

  // 把连续且属于同一个音符的单元合并成一个输出音符
  const result: Note[] = []
  let c = 0
  while (c < numCells) {
    const n = owner[c]
    if (!n) {
      c++
      continue
    }
    let end = c
    while (end < numCells && owner[end] === n) end++
    result.push({
      id: n.id,
      startBeat: c * Q,
      durationBeats: (end - c) * Q,
      key: n.key,
      octaveShift: n.octaveShift,
      isSharp: n.isSharp,
    })
    c = end
  }

  return result
}

export function extractMelody(
  notes: Note[],
  algorithm: MelodyAlgorithm,
): Note[] {
  if (notes.length === 0) return []

  let raw: Note[]
  switch (algorithm) {
    case 'skyline':
      raw = skyline(notes)
      break
    case 'top':
      raw = chordwise(notes, pickHighest)
      break
    case 'bottom':
      raw = chordwise(notes, pickLowest)
      break
    case 'longest':
      raw = chordwise(notes, pickLongest)
      break
  }
  return quantizeMelody(raw)
}