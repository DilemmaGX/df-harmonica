import type { Track, ProjectMeta } from '../types'
import { getMidiNote } from './noteMapping'

/**
 * 将当前工程导出为标准 MIDI 文件（SMF，格式 0，单轨）。
 *
 * - PPQ（每四分音符的 tick 数）= 480
 * - 一拍 = 一个四分音符（与 BPM 语义一致）
 * - 每个音符使用独立通道 0，力度 100，释放力度 64
 * - 写入速度事件、拍号事件与轨道名事件
 */

const PPQ = 480

interface MidiEvent {
  tick: number
  order: number
  bytes: number[]
}

/** MIDI 可变长度量编码 */
function writeVarLen(value: number): number[] {
  const bytes: number[] = [value & 0x7f]
  value >>>= 7
  while (value > 0) {
    bytes.unshift((value & 0x7f) | 0x80)
    value >>>= 7
  }
  return bytes
}

function writeUint32(value: number): number[] {
  return [
    (value >>> 24) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff,
  ]
}

function writeUint16(value: number): number[] {
  return [(value >>> 8) & 0xff, value & 0xff]
}

/** ASCII / Latin-1 文本 → 字节数组 */
function strToBytes(s: string): number[] {
  const out: number[] = []
  for (let i = 0; i < s.length; i++) {
    out.push(s.charCodeAt(i) & 0xff)
  }
  return out
}

/** 构造 MIDI 文件的二进制数据 */
export function buildMidiFile(track: Track, meta: ProjectMeta): Uint8Array {
  const events: MidiEvent[] = []
  let order = 0

  // 速度事件：FF 51 03 <微秒/四分音符>
  const microsecondsPerQuarter = Math.max(
    1,
    Math.round(60000000 / Math.max(1, track.bpm)),
  )
  events.push({
    tick: 0,
    order: order++,
    bytes: [
      0xff,
      0x51,
      0x03,
      (microsecondsPerQuarter >>> 16) & 0xff,
      (microsecondsPerQuarter >>> 8) & 0xff,
      microsecondsPerQuarter & 0xff,
    ],
  })

  // 拍号事件：FF 58 04 <分子> <2 的幂> <24> <8>
  const denominator = 4
  const denominatorPower = Math.round(Math.log2(denominator)) // 2
  events.push({
    tick: 0,
    order: order++,
    bytes: [
      0xff,
      0x58,
      0x04,
      Math.max(1, Math.min(255, track.beatsPerBar)),
      denominatorPower & 0xff,
      24,
      8,
    ],
  })

  // 轨道名事件：FF 03 <长度> <文本>
  const trackName = (meta.title || 'Harmonica').slice(0, 255)
  const nameBytes = strToBytes(trackName)
  events.push({
    tick: 0,
    order: order++,
    bytes: [0xff, 0x03, ...writeVarLen(nameBytes.length), ...nameBytes],
  })

  // 音符事件
  const channel = 0
  for (const note of track.notes) {
    const midi = getMidiNote(note.key, note.octaveShift, note.isSharp)
    if (midi < 0 || midi > 127) continue

    const startTick = Math.max(0, Math.round(note.startBeat * PPQ))
    const endTick = Math.max(
      startTick + 1,
      Math.round((note.startBeat + note.durationBeats) * PPQ),
    )

    events.push({
      tick: startTick,
      order: order++,
      bytes: [0x90 | channel, midi, 100],
    })
    events.push({
      tick: endTick,
      order: order++,
      bytes: [0x80 | channel, midi, 64],
    })
  }

  // 按 tick 排序；同一 tick 内 NoteOff 先于 NoteOn
  events.sort((a, b) => {
    if (a.tick !== b.tick) return a.tick - b.tick
    const aIsOff = (a.bytes[0] & 0xf0) === 0x80 ? 0 : 1
    const bIsOff = (b.bytes[0] & 0xf0) === 0x80 ? 0 : 1
    if (aIsOff !== bIsOff) return aIsOff - bIsOff
    return a.order - b.order
  })

  // 组装轨道数据（带 delta time）
  const trackData: number[] = []
  let lastTick = 0
  for (const ev of events) {
    const delta = Math.max(0, ev.tick - lastTick)
    trackData.push(...writeVarLen(delta))
    trackData.push(...ev.bytes)
    lastTick = ev.tick
  }
  // 轨道结束：00 FF 2F 00
  trackData.push(0x00, 0xff, 0x2f, 0x00)

  // 头部块
  const header: number[] = [
    ...strToBytes('MThd'),
    0, 0, 0, 6,
    0, 0, // 格式 0
    0, 1, // 轨道数
    ...writeUint16(PPQ),
  ]

  // 轨道块
  const trackChunk: number[] = [
    ...strToBytes('MTrk'),
    ...writeUint32(trackData.length),
    ...trackData,
  ]

  return new Uint8Array([...header, ...trackChunk])
}

/** 触发浏览器下载 .mid 文件 */
export function downloadMidi(track: Track, meta: ProjectMeta): void {
  const bytes = buildMidiFile(track, meta)
  const blob = new Blob([bytes], { type: 'audio/midi' })
  const url = URL.createObjectURL(blob)

  const fileName = (meta.title.trim() || 'harmonica-score').replace(
    /[\\/:*?"<>|]/g,
    '_',
  )

  const a = document.createElement('a')
  a.href = url
  a.download = `${fileName}.mid`
  a.click()
  URL.revokeObjectURL(url)
}