import type { Note } from '../types'
import { findBestMapping } from './noteMapping'

/**
 * 解析标准 MIDI 文件（SMF 格式 0 / 1）。
 *
 * - 支持多条轨道
 * - 支持 running status
 * - 读取首个速度事件（FF 51）与拍号事件（FF 58）
 * - 将 Note On / Note Off 配对为音符，tick 转换为拍（PPQ 基准）
 * - 超出 harmonica 音域的音符会被跳过
 */

export interface ParsedMidi {
  notes: Note[]
  bpm: number
  beatsPerBar: number
}

function readUint16(data: Uint8Array, offset: number): number {
  return (data[offset] << 8) | data[offset + 1]
}

function readUint32(data: Uint8Array, offset: number): number {
  return (
    ((data[offset] << 24) |
      (data[offset + 1] << 16) |
      (data[offset + 2] << 8) |
      data[offset + 3]) >>>
    0
  )
}

function readVarLen(
  data: Uint8Array,
  offset: number,
): { value: number; offset: number } {
  let value = 0
  let count = 0
  while (offset < data.length && count < 4) {
    const byte = data[offset++]
    value = (value << 7) | (byte & 0x7f)
    count++
    if ((byte & 0x80) === 0) break
  }
  return { value, offset }
}

interface RawNote {
  midi: number
  startTick: number
  endTick: number
}

export function parseMidiFile(data: Uint8Array): ParsedMidi | null {
  if (data.length < 14) return null

  // 头部块：MThd
  if (
    data[0] !== 0x4d ||
    data[1] !== 0x54 ||
    data[2] !== 0x68 ||
    data[3] !== 0x64
  ) {
    return null
  }

  const headerLen = readUint32(data, 4)
  const numTracks = readUint16(data, 10)
  const division = readUint16(data, 12)

  // 仅支持 ticks-per-quarter-note 模式（高位为 0）
  if (division & 0x8000) return null
  const ppq = division
  if (ppq <= 0) return null

  let offset = 8 + headerLen
  let bpm = 120
  let bpmSet = false
  let beatsPerBar = 4
  let beatsPerBarSet = false

  const rawNotes: RawNote[] = []
  // 全局活跃音符：key = (channel << 8) | midi
  const activeNotes = new Map<number, number>()

  for (let trackIdx = 0; trackIdx < numTracks; trackIdx++) {
    if (offset + 8 > data.length) break
    // 轨道块：MTrk
    if (
      data[offset] !== 0x4d ||
      data[offset + 1] !== 0x54 ||
      data[offset + 2] !== 0x72 ||
      data[offset + 3] !== 0x6b
    ) {
      break
    }
    offset += 4
    const trackLen = readUint32(data, offset)
    offset += 4
    const trackEnd = Math.min(offset + trackLen, data.length)

    let absTick = 0
    let lastStatus = 0

    while (offset < trackEnd) {
      const dt = readVarLen(data, offset)
      absTick += dt.value
      offset = dt.offset

      if (offset >= trackEnd) break

      let status = data[offset]
      if (status < 0x80) {
        // running status
        status = lastStatus
      } else {
        offset++
        lastStatus = status
      }

      if (status === 0xff) {
        // Meta 事件
        if (offset >= trackEnd) break
        const metaType = data[offset++]
        const lenInfo = readVarLen(data, offset)
        offset = lenInfo.offset
        const metaLen = lenInfo.value
        const metaStart = offset
        offset += metaLen

        if (metaType === 0x51 && metaLen === 3 && !bpmSet) {
          const usPerQuarter =
            (data[metaStart] << 16) |
            (data[metaStart + 1] << 8) |
            data[metaStart + 2]
          if (usPerQuarter > 0) {
            bpm = Math.max(40, Math.min(240, Math.round(60000000 / usPerQuarter)))
            bpmSet = true
          }
        } else if (metaType === 0x58 && metaLen >= 2 && !beatsPerBarSet) {
          const nn = data[metaStart]
          if (nn > 0) {
            beatsPerBar = Math.max(1, Math.min(12, nn))
            beatsPerBarSet = true
          }
        }
      } else if (status === 0xf0 || status === 0xf7) {
        // SysEx：读取长度并跳过
        const lenInfo = readVarLen(data, offset)
        offset = lenInfo.offset + lenInfo.value
      } else {
        const channel = status & 0x0f
        const eventType = status & 0xf0

        if (eventType === 0x80) {
          // Note Off
          if (offset + 1 >= trackEnd) break
          const midi = data[offset++]
          offset++ // velocity
          const key = (channel << 8) | midi
          const startTick = activeNotes.get(key)
          if (startTick !== undefined) {
            activeNotes.delete(key)
            rawNotes.push({ midi, startTick, endTick: absTick })
          }
        } else if (eventType === 0x90) {
          // Note On
          if (offset + 1 >= trackEnd) break
          const midi = data[offset++]
          const velocity = data[offset++]
          const key = (channel << 8) | midi
          if (velocity === 0) {
            const startTick = activeNotes.get(key)
            if (startTick !== undefined) {
              activeNotes.delete(key)
              rawNotes.push({ midi, startTick, endTick: absTick })
            }
          } else {
            activeNotes.set(key, absTick)
          }
        } else if (eventType === 0xa0) {
          offset += 2
        } else if (eventType === 0xb0) {
          offset += 2
        } else if (eventType === 0xc0) {
          offset += 1
        } else if (eventType === 0xd0) {
          offset += 1
        } else if (eventType === 0xe0) {
          offset += 2
        } else {
          break
        }
      }
    }

    offset = trackEnd
  }

  if (rawNotes.length === 0) return null

  // tick → 拍，并映射到 harmonica 按键
  const sortedRaw = [...rawNotes].sort((a, b) => a.startTick - b.startTick)
  const notes: Note[] = []
  let idCounter = 0

  for (const rn of sortedRaw) {
    const startBeat = rn.startTick / ppq
    const durationBeats = Math.max(0.25, (rn.endTick - rn.startTick) / ppq)
    const mapping = findBestMapping(rn.midi)
    if (!mapping) continue

    notes.push({
      id: `midi-${idCounter++}-${Math.random().toString(36).slice(2, 6)}`,
      startBeat,
      durationBeats,
      key: mapping.key,
      octaveShift: mapping.octaveShift,
      isSharp: mapping.isSharp,
    })
  }

  if (notes.length === 0) return null

  return { notes, bpm, beatsPerBar }
}