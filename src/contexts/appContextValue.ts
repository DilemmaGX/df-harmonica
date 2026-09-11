import { createContext } from 'react'
import type {
  Language,
  Note,
  ProjectMeta,
  ThemeMode,
  Track,
} from '../types'

export interface AppState {
  track: Track
  setTrack: (track: Track) => void
  notes: Note[]
  setNotes: (notesOrUpdater: Note[] | ((prev: Note[]) => Note[])) => void
  meta: ProjectMeta
  setMeta: (meta: ProjectMeta) => void
  language: Language
  setLanguage: (lang: Language) => void
  themeMode: ThemeMode
  setThemeMode: (mode: ThemeMode) => void
  isPlaying: boolean
  setIsPlaying: (playing: boolean) => void
  /** 播放起始拍（小节开头），默认 0 = 1 号小节开头 */
  playStartBeat: number
  setPlayStartBeat: (beat: number) => void
  undo: () => void
  redo: () => void
  canUndo: boolean
  canRedo: boolean
  /**
   * 标记一个即将发生的变更进入撤销栈。
   * 调用者应当在真正修改 track / meta 之前调用它；
   * 变更后的下一帧会自动把新状态压入历史。
   */
  addToHistory: () => void
}

export const AppContext = createContext<AppState | null>(null)