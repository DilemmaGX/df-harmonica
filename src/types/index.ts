export type HarmonicaKey = 'z' | 'x' | 'c' | 'v' | 'b' | 'n' | 'm' | ','

export type OctaveShift = -1 | 0 | 1

export interface Note {
  id: string
  startBeat: number
  durationBeats: number
  key: HarmonicaKey
  octaveShift: OctaveShift
  isSharp: boolean
}

export interface Track {
  notes: Note[]
  bpm: number
  beatsPerBar: number
  // totalBeats 已移除，改为自动扩展
}

export type ThemeMode = 'light' | 'dark' | 'system'

export type Language = 'zh' | 'en'

export interface ValidationError {
  type: 'overlap' | 'invalidKey' | 'invalidDuration'
  message: string
  noteIds: string[]
}