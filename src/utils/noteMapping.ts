import type { HarmonicaKey, OctaveShift } from '../types'

const BASE_MIDI: Record<HarmonicaKey, number> = {
  z: 60, x: 62, c: 64, v: 65, b: 67, n: 69, m: 71, ',': 72,
}

export const KEY_ORDER: HarmonicaKey[] = ['z', 'x', 'c', 'v', 'b', 'n', 'm', ',']

export const KEY_DISPLAY: Record<HarmonicaKey, string> = {
  z: 'Z', x: 'X', c: 'C', v: 'V', b: 'B', n: 'N', m: 'M', ',': ',',
}

export function getMidiNote(
  key: HarmonicaKey,
  octaveShift: OctaveShift,
  isSharp: boolean,
): number {
  return BASE_MIDI[key] + octaveShift * 12 + (isSharp ? 1 : 0)
}

export function getMidiFrequency(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12)
}

export function findBestMapping(
  midi: number,
): { key: HarmonicaKey; octaveShift: OctaveShift; isSharp: boolean } | null {
  let best: {
    key: HarmonicaKey
    octaveShift: OctaveShift
    isSharp: boolean
    score: number
  } | null = null
  for (const key of KEY_ORDER) {
    for (const octaveShift of [-1, 0, 1] as OctaveShift[]) {
      for (const isSharp of [false, true]) {
        if (getMidiNote(key, octaveShift, isSharp) === midi) {
          let score = 0
          if (octaveShift === 0) score += 3
          else if (octaveShift === 1) score += 2
          else score += 1
          if (!isSharp) score += 2
          else score += 1
          if (!best || score > best.score) best = { key, octaveShift, isSharp, score }
        }
      }
    }
  }
  if (best) {
    return { key: best.key, octaveShift: best.octaveShift, isSharp: best.isSharp }
  }
  return null
}

export function getAllMappingsForMidi(
  midi: number,
): Array<{ key: HarmonicaKey; octaveShift: OctaveShift; isSharp: boolean }> {
  const mappings: Array<{
    key: HarmonicaKey
    octaveShift: OctaveShift
    isSharp: boolean
  }> = []
  for (const key of KEY_ORDER) {
    for (const octaveShift of [-1, 0, 1] as OctaveShift[]) {
      for (const isSharp of [false, true]) {
        if (getMidiNote(key, octaveShift, isSharp) === midi) {
          mappings.push({ key, octaveShift, isSharp })
        }
      }
    }
  }
  return mappings
}

export function getJianpuInfo(
  midi: number,
): { base: string; sharp: string; dotsAbove: number; dotsBelow: number } {
  const c4Midi = 60
  const midiOffset = midi - c4Midi
  const octaveDiff = Math.floor(midiOffset / 12)
  const semitoneInOctave = ((midiOffset % 12) + 12) % 12
  const degreeMap: { [key: number]: string } = {
    0: '1',
    1: '#1',
    2: '2',
    3: 'b3',
    4: '3',
    5: '4',
    6: '#4',
    7: '5',
    8: 'b6',
    9: '6',
    10: 'b7',
    11: '7',
  }
  let base = degreeMap[semitoneInOctave] || '1'
  let sharp = ''
  if (base.startsWith('#')) {
    sharp = '#'
    base = base.substring(1)
  } else if (base.startsWith('b')) {
    sharp = 'b'
    base = base.substring(1)
  }
  let dotsAbove = 0
  let dotsBelow = 0
  if (octaveDiff > 0) dotsAbove = octaveDiff
  else if (octaveDiff < 0) dotsBelow = -octaveDiff
  return { base, sharp, dotsAbove, dotsBelow }
}

export function getJianpuLabel(midi: number): string {
  const info = getJianpuInfo(midi)
  let label = info.base
  if (info.sharp === '#') label = '#' + label
  else if (info.sharp === 'b') label = 'b' + label
  if (info.dotsAbove > 0) label += '˙'.repeat(info.dotsAbove)
  if (info.dotsBelow > 0) label += '·'.repeat(info.dotsBelow)
  return label
}

export const MIN_MIDI = 48 // C3 低八度1
export const MAX_MIDI = 85 // C#6 高两个八度#1