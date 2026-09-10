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
import type { Language, Note, ThemeMode, Track, ValidationError } from '../types'
import { loadState, saveState } from '../utils/storage'

interface AppState {
  track: Track
  setTrack: (track: Track) => void
  notes: Note[]
  setNotes: (notesOrUpdater: Note[] | ((prev: Note[]) => Note[])) => void
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

export function AppProvider({ children }: AppProviderProps) {
  // 首次挂载时读取持久化状态（惰性初始化，仅执行一次）
  const [persisted] = useState(() => loadState())

  const [track, setTrackState] = useState<Track>(persisted?.track ?? DEFAULT_TRACK)
  const [language, setLanguage] = useState<Language>(persisted?.language ?? 'zh')
  const [themeMode, setThemeMode] = useState<ThemeMode>(persisted?.themeMode ?? 'system')
  const [errors, setErrors] = useState<ValidationError[]>([])
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)

  // 历史记录（不持久化）
  const [history, setHistory] = useState<Track[]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)

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

  const addToHistory = useCallback(() => {
    setHistory(prev => {
      const newHistory = prev.slice(0, historyIndex + 1)
      newHistory.push(track)
      return newHistory
    })
    setHistoryIndex(prev => Math.min(prev + 1, history.length))
  }, [track, historyIndex, history.length])

  const undo = useCallback(() => {
    if (historyIndex <= 0) return
    const newIndex = historyIndex - 1
    setTrackState(history[newIndex])
    setHistoryIndex(newIndex)
  }, [history, historyIndex])

  const redo = useCallback(() => {
    if (historyIndex >= history.length - 1) return
    const newIndex = historyIndex + 1
    setTrackState(history[newIndex])
    setHistoryIndex(newIndex)
  }, [history, historyIndex])

  const canUndo = historyIndex > 0
  const canRedo = historyIndex < history.length - 1

  // ---------------------------------------------------------------------------
  // 持久化
  // ---------------------------------------------------------------------------
  // stateRef 始终指向最新的三项持久化状态；用它避免卸载 / beforeunload 时拿到过期闭包
  const stateRef = useRef({ track, language, themeMode })
  stateRef.current = { track, language, themeMode }

  // 变化时防抖 300ms 写入
  useEffect(() => {
    const timer = window.setTimeout(() => {
      saveState(stateRef.current)
    }, 300)
    return () => window.clearTimeout(timer)
  }, [track, language, themeMode])

  // 关闭页面前立即写一次
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

  const isDark = themeMode === 'dark' || (themeMode === 'system' && systemPrefersDark)

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