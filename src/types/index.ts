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
}

/** 工程元信息：标题、作曲者、制谱者 */
export interface ProjectMeta {
  title: string
  composer: string
  transcriber: string
}

/** 工程文件格式（用于上传/下载/二维码） */
export interface ProjectFile {
  format: 'df-harmonica-project'
  version: 1
  meta: ProjectMeta
  track: Track
}

export type ThemeMode = 'light' | 'dark' | 'system'

export type Language = 'zh' | 'en'