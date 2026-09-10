import type { Note, Track, HarmonicaKey, OctaveShift } from '../types'
import { getMidiNote, KEY_ORDER, KEY_DISPLAY } from './noteMapping'

function midiToAbcPitch(midi: number): string {
  const noteNames = ['C', 'D', 'E', 'F', 'G', 'A', 'B']
  const pitchClass = midi % 12
  const octave = Math.floor(midi / 12) - 1

  let baseIndex = -1
  let accidental = ''
  for (let i = 0; i < 7; i++) {
    const baseMidi = [0, 2, 4, 5, 7, 9, 11][i]
    if (baseMidi === pitchClass) {
      baseIndex = i
      break
    }
    if (baseMidi + 1 === pitchClass) {
      baseIndex = i
      accidental = '^'
      break
    }
  }

  if (baseIndex === -1) return 'C'

  const baseName = noteNames[baseIndex]
  let abcName: string

  if (octave <= 3) {
    abcName = baseName + ','.repeat(4 - octave)
  } else if (octave === 4) {
    abcName = baseName
  } else {
    abcName = baseName.toLowerCase() + "'".repeat(octave - 5)
  }

  return accidental + abcName
}

function abcPitchToMidi(abcPitch: string): number | null {
  const match = abcPitch.match(/^(\^|_)?([A-Ga-g])([',]*)$/)
  if (!match) return null

  const [, accidental, letter, octaveMarks] = match
  const noteIndex = ['C', 'D', 'E', 'F', 'G', 'A', 'B'].indexOf(letter.toUpperCase())
  if (noteIndex === -1) return null

  const baseMidi = [0, 2, 4, 5, 7, 9, 11][noteIndex]
  const isUpper = letter === letter.toUpperCase()

  let octave: number
  if (isUpper) {
    octave = 4 - (octaveMarks.match(/,/g)?.length ?? 0)
  } else {
    octave = 5 + (octaveMarks.match(/'/g)?.length ?? 0)
  }

  // 标准 ABC：大写 C = C4 = MIDI 60，因此需要 (octave + 1) * 12
  let midi = (octave + 1) * 12 + baseMidi
  if (accidental === '^') midi += 1
  if (accidental === '_') midi -= 1

  return midi
}

function beatsToAbcDuration(durationBeats: number): string {
  const eighthNotes = durationBeats * 2
  if (Math.abs(eighthNotes - Math.round(eighthNotes)) < 0.001) {
    const n = Math.round(eighthNotes)
    if (n === 1) return ''
    if (n === 2) return '2'
    if (n === 4) return '4'
    if (n === 8) return '8'
    if (n > 0) return `${n}`
  }

  const sixteenthNotes = durationBeats * 4
  if (Math.abs(sixteenthNotes - Math.round(sixteenthNotes)) < 0.001) {
    const n = Math.round(sixteenthNotes)
    if (n === 1) return '1/2'
    return `${n}/2`
  }

  const quarterNotes = durationBeats
  if (Math.abs(quarterNotes - Math.round(quarterNotes)) < 0.001) {
    const n = Math.round(quarterNotes)
    if (n === 1) return ''
    if (n === 2) return '2'
    if (n === 3) return '3'
  }

  return Math.round(durationBeats * 4).toString()
}

function abcDurationToBeats(duration: string): number {
  // 默认音符长度 L:1/8 → 一个八分音符 = 0.5 拍
  const DEFAULT_NOTE = 0.5
  if (!duration) return DEFAULT_NOTE
  if (duration.includes('/')) {
    const [num, den] = duration.split('/').map(Number)
    if (!den || !num) return DEFAULT_NOTE
    // 分数是「默认音符长度的倍数」，因此 × 0.5 拍
    return (num / den) * DEFAULT_NOTE
  }
  const n = Number(duration)
  if (Number.isNaN(n) || n <= 0) return DEFAULT_NOTE
  return n * DEFAULT_NOTE
}

export function notesToAbc(track: Track): string {
  const notes = [...track.notes].sort((a, b) => a.startBeat - b.startBeat)

  // 头部包含 BPM（Q:1/4=xxx）与拍号（M:x/4），保证导入端可完整还原
  const header: string[] = [
    'X:1',
    'T:Harmonica Tune',
    `M:${track.beatsPerBar}/4`,
    'L:1/8',
    `Q:1/4=${track.bpm}`,
    'K:C',
  ]

  if (notes.length === 0) {
    return header.join('\n') + '\n'
  }

  const lines: string[] = [...header]
  let currentBeat = 0
  let currentLine = ''
  let lineBeatCount = 0

  for (const note of notes) {
    if (note.startBeat > currentBeat + 0.001) {
      const restDuration = note.startBeat - currentBeat
      const restAbc = 'z' + beatsToAbcDuration(restDuration)
      currentLine += restAbc + ' '
      lineBeatCount += restDuration
      currentBeat = note.startBeat
      if (lineBeatCount >= track.beatsPerBar * 2) {
        lines.push(currentLine.trim())
        currentLine = ''
        lineBeatCount = 0
      }
    }

    const midi = getMidiNote(note.key, note.octaveShift, note.isSharp)
    const abcPitch = midiToAbcPitch(midi)
    const abcDuration = beatsToAbcDuration(note.durationBeats)
    currentLine += abcPitch + abcDuration + ' '
    lineBeatCount += note.durationBeats
    currentBeat = note.startBeat + note.durationBeats

    if (lineBeatCount >= track.beatsPerBar * 2) {
      lines.push(currentLine.trim())
      currentLine = ''
      lineBeatCount = 0
    }
  }

  if (currentLine.trim()) {
    lines.push(currentLine.trim())
  }

  return lines.join('\n')
}

export function abcToNotes(
  abcString: string,
): { notes: Note[]; beatsPerBar: number; bpm: number } | null {
  const lines = abcString
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0)

  let beatsPerBar = 4
  let bpm = 120
  const noteLines: string[] = []

  const headerRegex = /^([A-Z]):\s*(.*)$/
  for (const line of lines) {
    const match = line.match(headerRegex)
    if (match) {
      const [, field, value] = match

      if (field === 'M') {
        const v = value.trim()
        if (v.includes('/')) {
          // M:4/4、M:3/4、M:6/8 等 → 取分子
          const num = Number(v.split('/')[0])
          if (num > 0) beatsPerBar = num
        } else if (v === 'C') {
          beatsPerBar = 4
        } else if (v === 'C|') {
          beatsPerBar = 2
        }
      }

      if (field === 'Q') {
        // 支持 Q:1/4=120 / Q:120 / Q:"Andante" 1/4=120
        const eqIdx = value.lastIndexOf('=')
        const numStr = (eqIdx !== -1 ? value.slice(eqIdx + 1) : value).trim()
        const num = Number(numStr)
        if (num > 0) bpm = num
      }

      continue
    }
    if (!line.startsWith('%') && !line.startsWith('|')) {
      noteLines.push(line)
    }
  }

  if (noteLines.length === 0) return null

  const notes: Note[] = []
  let currentBeat = 0
  let noteId = 0

  const tokenRegex = /(\^|_)?([A-Ga-gz])([',]*)(\d*\/?\d*)/g

  for (const line of noteLines) {
    const cleanLine = line.replace(/\|/g, ' ').replace(/\s+/g, ' ').trim()
    let match: RegExpExecArray | null

    while ((match = tokenRegex.exec(cleanLine)) !== null) {
      const [, accidental, letter, octaveMarks, durationStr] = match

      const durationBeats = abcDurationToBeats(durationStr || '')

      if (letter.toLowerCase() === 'z') {
        currentBeat += durationBeats
        continue
      }

      const abcPitch = (accidental || '') + letter + octaveMarks
      const midi = abcPitchToMidi(abcPitch)
      if (midi === null) continue

      const mapping = findMappingForMidi(midi)
      if (!mapping) continue

      notes.push({
        id: `note-${noteId++}`,
        startBeat: currentBeat,
        durationBeats,
        key: mapping.key,
        octaveShift: mapping.octaveShift,
        isSharp: mapping.isSharp,
      })

      currentBeat += durationBeats
    }
  }

  return { notes, beatsPerBar, bpm }
}

function findMappingForMidi(
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
          if (!best || score > best.score) {
            best = { key, octaveShift, isSharp, score }
          }
        }
      }
    }
  }

  if (best) {
    return { key: best.key, octaveShift: best.octaveShift, isSharp: best.isSharp }
  }
  return null
}

export function getAbcKeyLabel(note: Note): string {
  const mod = note.octaveShift === -1 ? '↓' : note.octaveShift === 1 ? '↑' : ''
  const sharp = note.isSharp ? '#' : ''
  return `${KEY_DISPLAY[note.key]}${sharp}${mod}`
}