import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
  type ReactNode,
} from 'react'
import { ThemeProvider, createTheme, CssBaseline } from '@mui/material'
import type {
  Language,
  Note,
  ProjectMeta,
  ThemeMode,
  Track,
  ValidationError,
} from '../types'
import { loadState, saveState, DEFAULT_META } from '../utils/storage'

interface AppState {
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
  errors: ValidationError[]
  setErrors: (errors: ValidationError[]) => void
  selectedNoteId: string | null
  setSelectedNoteId: (id: string | null) => void
  isPlaying: boolean
  setIsPlaying: (playing: boolean) => void
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

const AppContext = createContext<AppState | null>(null)

export function useAppContext(): AppState {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useAppContext must be used within AppProvider')
  return ctx
}

interface AppProviderProps {
  children: ReactNode
}

const DEFAULT_TRACK: Track = {
  notes: [],
  bpm: 120,
  beatsPerBar: 4,
}

interface HistorySnapshot {
  track: Track
  meta: ProjectMeta
}

export function AppProvider({ children }: AppProviderProps) {
  const [persisted] = useState(() => loadState())

  const initialTrack = persisted?.track ?? DEFAULT_TRACK
  const initialMeta = persisted?.meta ?? DEFAULT_META

  const [track, setTrackState] = useState<Track>(initialTrack)
  const [meta, setMetaState] = useState<ProjectMeta>(initialMeta)
  const [language, setLanguage] = useState<Language>(persisted?.language ?? 'zh')
  const [themeMode, setThemeMode] = useState<ThemeMode>(
    persisted?.themeMode ?? 'system',
  )
  const [errors, setErrors] = useState<ValidationError[]>([])
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)

  // ---------------- 撤销 / 重做 ----------------
  // 历史用 ref 保存，避免闭包过期；对外只暴露布尔状态用于渲染。
  const historyRef = useRef<HistorySnapshot[]>([
    { track: initialTrack, meta: initialMeta },
  ])
  const historyIndexRef = useRef(0)
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)

  // 挂起的提交：addToHistory 只做标记，等状态真正变化后由 effect 压栈。
  const pendingCommitRef = useRef(false)

  const updateCanUndoRedo = useCallback(() => {
    setCanUndo(historyIndexRef.current > 0)
    setCanRedo(
      historyIndexRef.current < historyRef.current.length - 1,
    )
  }, [])

  const addToHistory = useCallback(() => {
    pendingCommitRef.current = true
  }, [])

  // 状态变化时，如有挂起提交 → 压栈（在新状态之后）
  useEffect(() => {
    if (!pendingCommitRef.current) return
    pendingCommitRef.current = false
    const idx = historyIndexRef.current
    const trimmed = historyRef.current.slice(0, idx + 1)
    trimmed.push({ track, meta })
    historyRef.current = trimmed
    historyIndexRef.current = trimmed.length - 1
    updateCanUndoRedo()
  }, [track, meta, updateCanUndoRedo])

  const setTrack = useCallback((t: Track) => {
    setTrackState(t)
  }, [])

  const setNotes = useCallback(
    (notesOrUpdater: Note[] | ((prev: Note[]) => Note[])) => {
      setTrackState(prev => {
        const newNotes =
          typeof notesOrUpdater === 'function'
            ? notesOrUpdater(prev.notes)
            : notesOrUpdater
        return { ...prev, notes: newNotes }
      })
    },
    [],
  )

  const setMeta = useCallback((m: ProjectMeta) => {
    setMetaState(m)
  }, [])

  const undo = useCallback(() => {
    if (historyIndexRef.current <= 0) return
    historyIndexRef.current -= 1
    const target = historyRef.current[historyIndexRef.current]
    if (!target) return
    pendingCommitRef.current = false
    setTrackState(target.track)
    setMetaState(target.meta)
    updateCanUndoRedo()
  }, [updateCanUndoRedo])

  const redo = useCallback(() => {
    if (historyIndexRef.current >= historyRef.current.length - 1) return
    historyIndexRef.current += 1
    const target = historyRef.current[historyIndexRef.current]
    if (!target) return
    pendingCommitRef.current = false
    setTrackState(target.track)
    setMetaState(target.meta)
    updateCanUndoRedo()
  }, [updateCanUndoRedo])

  // ---------------------------------------------------------------------------
  // 持久化
  // ---------------------------------------------------------------------------
  const stateRef = useRef({ track, meta, language, themeMode })
  stateRef.current = { track, meta, language, themeMode }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      saveState(stateRef.current)
    }, 300)
    return () => window.clearTimeout(timer)
  }, [track, meta, language, themeMode])

  useEffect(() => {
    const handleBeforeUnload = () => {
      saveState(stateRef.current)
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [])

  // ---------------------------------------------------------------------------
  // 主题跟随系统
  // ---------------------------------------------------------------------------
  const [systemPrefersDark, setSystemPrefersDark] = useState(
    (typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-color-scheme: dark)').matches) ??
      false,
  )

  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)')
    if (!mq) return
    const handler = (e: MediaQueryListEvent) => setSystemPrefersDark(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  const isDark =
    themeMode === 'dark' || (themeMode === 'system' && systemPrefersDark)

  const theme = createTheme({
    palette: {
      mode: isDark ? 'dark' : 'light',
      primary: { main: '#7c3aed' },
      secondary: { main: '#0ea5e9' },
      background: {
        default: isDark ? '#121212' : '#f5f5f5',
        paper: isDark ? '#1e1e1e' : '#ffffff',
      },
    },
    typography: {
      fontFamily: [
        'Inter',
        'system-ui',
        '-apple-system',
        'BlinkMacSystemFont',
        'Segoe UI',
        'Roboto',
        'sans-serif',
      ].join(','),
    },
  })

  return (
    <AppContext.Provider
      value={{
        track,
        setTrack,
        notes: track.notes,
        setNotes,
        meta,
        setMeta,
        language,
        setLanguage,
        themeMode,
        setThemeMode,
        errors,
        setErrors,
        selectedNoteId,
        setSelectedNoteId,
        isPlaying,
        setIsPlaying,
        undo,
        redo,
        canUndo,
        canRedo,
        addToHistory,
      }}
    >
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </AppContext.Provider>
  )
}