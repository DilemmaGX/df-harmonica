import {
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
} from '../types'
import { loadState, saveState, DEFAULT_META } from '../utils/storage'
import { AppContext, type AppState } from './appContextValue'

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
  const [language, setLanguage] = useState<Language>(
    persisted?.language ?? 'zh',
  )
  const [themeMode, setThemeMode] = useState<ThemeMode>(
    persisted?.themeMode ?? 'system',
  )
  const [isPlaying, setIsPlaying] = useState(false)
  const [playStartBeat, setPlayStartBeat] = useState(0)

  // ---------------- 撤销 / 重做 ----------------
  const historyRef = useRef<HistorySnapshot[]>([
    { track: initialTrack, meta: initialMeta },
  ])
  const historyIndexRef = useRef(0)
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)

  const pendingCommitRef = useRef(false)

  const updateCanUndoRedo = useCallback(() => {
    setCanUndo(historyIndexRef.current > 0)
    setCanRedo(historyIndexRef.current < historyRef.current.length - 1)
  }, [])

  const addToHistory = useCallback(() => {
    pendingCommitRef.current = true
  }, [])

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
  //
  // 直接在 effect 里闭包捕获最新状态，无需在渲染期间读写 ref。
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const timer = window.setTimeout(() => {
      saveState({ track, meta, language, themeMode })
    }, 300)
    return () => window.clearTimeout(timer)
  }, [track, meta, language, themeMode])

  useEffect(() => {
    const handleBeforeUnload = () => {
      saveState({ track, meta, language, themeMode })
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [track, meta, language, themeMode])

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
        'system-ui',
        '-apple-system',
        'BlinkMacSystemFont',
        'Segoe UI',
        'Roboto',
        'sans-serif',
      ].join(','),
    },
  })

  const value: AppState = {
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
    isPlaying,
    setIsPlaying,
    playStartBeat,
    setPlayStartBeat,
    undo,
    redo,
    canUndo,
    canRedo,
    addToHistory,
  }

  return (
    <AppContext.Provider value={value}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </AppContext.Provider>
  )
}