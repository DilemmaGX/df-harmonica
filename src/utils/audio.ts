import type { Note } from '../types'
import { getMidiFrequency, getMidiNote } from './noteMapping'

let audioContext: AudioContext | null = null
interface Stoppable {
  stop: () => void
}
let currentSources: Stoppable[] = []

// 试听（持续音）
let previewOsc: OscillatorNode | null = null
let previewGain: GainNode | null = null

// 实时演奏（多音持续）—— 以 id 为键，支持同时按下多个音
interface KeyNoteHandle {
  osc: OscillatorNode
  gain: GainNode
}
const activeKeyNotes = new Map<string, KeyNoteHandle>()

function getAudioContext(): AudioContext {
  if (!audioContext) {
    audioContext = new AudioContext()
  }
  return audioContext
}

export function playNotes(notes: Note[], bpm: number, onEnd?: () => void): void {
  stopPlayback()
  const ctx = getAudioContext()
  if (ctx.state === 'suspended') {
    void ctx.resume()
  }

  const secondsPerBeat = 60 / bpm
  const startOffset = 0.1
  let maxEndTime = 0

  for (const note of notes) {
    const midi = getMidiNote(note.key, note.octaveShift, note.isSharp)
    const frequency = getMidiFrequency(midi)
    const startTime = ctx.currentTime + startOffset + note.startBeat * secondsPerBeat
    const duration = note.durationBeats * secondsPerBeat

    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    const filter = ctx.createBiquadFilter()

    osc.type = 'sawtooth'
    osc.frequency.value = frequency

    filter.type = 'lowpass'
    filter.frequency.value = Math.min(frequency * 4, 6000)
    filter.Q.value = 0.7

    gain.gain.setValueAtTime(0, startTime)
    gain.gain.linearRampToValueAtTime(0.35, startTime + 0.015)
    gain.gain.setValueAtTime(0.35, Math.max(startTime + 0.015, startTime + duration * 0.7))
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration)

    osc.connect(filter)
    filter.connect(gain)
    gain.connect(ctx.destination)

    osc.start(startTime)
    osc.stop(startTime + duration + 0.05)

    currentSources.push(osc)
    maxEndTime = Math.max(maxEndTime, startTime + duration)
  }

  if (onEnd) {
    const timer = setTimeout(onEnd, (maxEndTime - ctx.currentTime) * 1000 + 200)
    currentSources.push({
      stop: () => clearTimeout(timer),
    })
  }
}

export function stopPlayback(): void {
  for (const source of currentSources) {
    try {
      source.stop()
    } catch {
      // ignore
    }
  }
  currentSources = []
}

// 试听：按下时开始持续播放（类似钢琴按键，按下多久播多久）
export function startPreviewNote(midi: number): void {
  stopPreviewNote()
  const ctx = getAudioContext()
  if (ctx.state === 'suspended') {
    void ctx.resume()
  }

  const frequency = getMidiFrequency(midi)
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  const filter = ctx.createBiquadFilter()

  osc.type = 'sawtooth'
  osc.frequency.value = frequency

  filter.type = 'lowpass'
  filter.frequency.value = Math.min(frequency * 4, 6000)
  filter.Q.value = 0.7

  const now = ctx.currentTime
  gain.gain.setValueAtTime(0, now)
  gain.gain.linearRampToValueAtTime(0.35, now + 0.015)

  osc.connect(filter)
  filter.connect(gain)
  gain.connect(ctx.destination)

  osc.start(now)

  previewOsc = osc
  previewGain = gain
}

export function stopPreviewNote(): void {
  if (!previewOsc || !previewGain || !audioContext) {
    previewOsc = null
    previewGain = null
    return
  }
  const now = audioContext.currentTime
  const osc = previewOsc
  const gain = previewGain
  previewOsc = null
  previewGain = null
  try {
    gain.gain.cancelScheduledValues(now)
    const currentValue = gain.gain.value
    gain.gain.setValueAtTime(currentValue, now)
    gain.gain.linearRampToValueAtTime(0, now + 0.05)
    osc.stop(now + 0.06)
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------------------
// 实时演奏：以任意字符串 id 为键的持续音，支持多键同时按住
// ---------------------------------------------------------------------------

export function startKeyNote(id: string, midi: number): void {
  // 若已存在同 id 的音，先平滑停止（避免叠音）
  stopKeyNote(id)

  const ctx = getAudioContext()
  if (ctx.state === 'suspended') {
    void ctx.resume()
  }

  const frequency = getMidiFrequency(midi)
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  const filter = ctx.createBiquadFilter()

  osc.type = 'sawtooth'
  osc.frequency.value = frequency

  filter.type = 'lowpass'
  filter.frequency.value = Math.min(frequency * 4, 6000)
  filter.Q.value = 0.7

  const now = ctx.currentTime
  gain.gain.setValueAtTime(0, now)
  gain.gain.linearRampToValueAtTime(0.3, now + 0.012)

  osc.connect(filter)
  filter.connect(gain)
  gain.connect(ctx.destination)

  osc.start(now)

  activeKeyNotes.set(id, { osc, gain })
}

export function stopKeyNote(id: string): void {
  const handle = activeKeyNotes.get(id)
  if (!handle) return
  activeKeyNotes.delete(id)
  if (!audioContext) return
  const now = audioContext.currentTime
  try {
    handle.gain.gain.cancelScheduledValues(now)
    handle.gain.gain.setValueAtTime(handle.gain.gain.value, now)
    handle.gain.gain.linearRampToValueAtTime(0, now + 0.05)
    handle.osc.stop(now + 0.06)
  } catch {
    // ignore
  }
}

export function stopAllKeyNotes(): void {
  for (const id of Array.from(activeKeyNotes.keys())) {
    stopKeyNote(id)
  }
}