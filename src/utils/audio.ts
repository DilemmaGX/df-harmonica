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