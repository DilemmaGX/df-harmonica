import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Box, Alert, Snackbar, useTheme } from '@mui/material'
import type { Note } from '../types'
import { getMidiNote, findBestMapping, MIN_MIDI, MAX_MIDI, getJianpuLabel } from '../utils/noteMapping'
import { useAppContext } from '../contexts/AppContext'
import { getTranslations } from '../i18n/translations'
import { playNotes, stopPlayback, startPreviewNote, stopPreviewNote } from '../utils/audio'

interface PianoRollProps {
  width?: number
  height?: number
}

const BEAT_HEADER_HEIGHT = 32
const LEFT_PADDING = 56
const MIN_VISIBLE_BEATS = 16
const DEFAULT_ROW_HEIGHT = 32
const DEFAULT_PIXELS_PER_BEAT = 80
const MIN_PIXELS_PER_BEAT = 30
const MAX_PIXELS_PER_BEAT = 240
const RESIZE_ZONE = 10

interface DragState {
  type: 'move' | 'resizeLeft' | 'resizeRight' | 'create' | 'select' | 'deleteSelect' | 'none'
  noteId: string | null
  startClientX: number
  startClientY: number
  startContentX: number
  startContentY: number
  originalStartBeat: number
  originalDuration: number
  originalMidi: number
}

interface SelectionRect {
  x1: number
  y1: number
  x2: number
  y2: number
}

interface ClipboardNote {
  relativeBeat: number
  relativeMidi: number
  durationBeats: number
  key: Note['key']
  octaveShift: Note['octaveShift']
  isSharp: boolean
}

export function PianoRoll(_props: PianoRollProps) {
  const {
    track,
    setNotes,
    language,
    isPlaying,
    setIsPlaying,
    addToHistory,
    undo,
    redo,
  } = useAppContext()
  const t = getTranslations(language)
  const theme = useTheme()
  const isDark = theme.palette.mode === 'dark'

  const [snackbarOpen, setSnackbarOpen] = useState(false)
  const [snackbarMessage, setSnackbarMessage] = useState('')
  const [pixelsPerBeat, setPixelsPerBeat] = useState(DEFAULT_PIXELS_PER_BEAT)
  const [hoveredNoteId, setHoveredNoteId] = useState<string | null>(null)
  const [hoverCursor, setHoverCursor] = useState<string>('crosshair')
  const [selectedNoteIds, setSelectedNoteIds] = useState<Set<string>>(new Set())
  const [selectionRect, setSelectionRect] = useState<SelectionRect | null>(null)
  const [selectionMode, setSelectionMode] = useState<'select' | 'deleteSelect' | null>(null)
  const [containerSize, setContainerSize] = useState({ width: 800, height: 600 })
  const [clipboard, setClipboard] = useState<ClipboardNote[] | null>(null)
  const [ghostMode, setGhostMode] = useState(false)
  const [ghostPos, setGhostPos] = useState<{ x: number; y: number } | null>(null)
  const [previewMidi, setPreviewMidi] = useState<number | null>(null)

  const containerRef = useRef<HTMLDivElement>(null)
  const dragStateRef = useRef<DragState>({
    type: 'none',
    noteId: null,
    startClientX: 0,
    startClientY: 0,
    startContentX: 0,
    startContentY: 0,
    originalStartBeat: 0,
    originalDuration: 0,
    originalMidi: 0,
  })
  const playbackStartTimeRef = useRef<number | null>(null)
  const animationFrameRef = useRef<number | null>(null)
  const [playheadBeat, setPlayheadBeat] = useState(0)

  // 监听容器尺寸
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const updateSize = () => {
      setContainerSize({
        width: container.clientWidth,
        height: container.clientHeight,
      })
    }
    updateSize()
    const observer = new ResizeObserver(updateSize)
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  // 最少显示拍数
  const minVisibleBeats = useMemo(() => {
    const availableWidth = containerSize.width - LEFT_PADDING
    const beats = Math.ceil(availableWidth / pixelsPerBeat)
    const bpb = track.beatsPerBar || 4
    return Math.max(MIN_VISIBLE_BEATS, Math.ceil(beats / bpb) * bpb)
  }, [containerSize.width, pixelsPerBeat, track.beatsPerBar])

  // 总拍数
  const totalBeats = useMemo(() => {
    let lastEnd = 0
    if (track.notes.length > 0) {
      lastEnd = Math.max(...track.notes.map(n => n.startBeat + n.durationBeats))
    }
    const required = Math.max(minVisibleBeats, Math.ceil(lastEnd) + 8)
    const bpb = track.beatsPerBar || 4
    return Math.ceil(required / bpb) * bpb
  }, [track.notes, minVisibleBeats, track.beatsPerBar])

  const totalRows = MAX_MIDI - MIN_MIDI + 1
  const totalContentWidth = LEFT_PADDING + totalBeats * pixelsPerBeat + 100
  const totalContentHeight = BEAT_HEADER_HEIGHT + totalRows * DEFAULT_ROW_HEIGHT + 80

  const getRowColor = (midi: number): string => {
    if (midi === 60 || midi === 72) return isDark ? 'rgba(128,128,128,0.25)' : 'rgba(128,128,128,0.15)'
    if (midi >= 48 && midi <= 59) return isDark ? 'rgba(220,38,38,0.25)' : 'rgba(239,68,68,0.12)'
    if (midi >= 61 && midi <= 71) return isDark ? 'rgba(37,99,235,0.25)' : 'rgba(59,130,246,0.12)'
    if (midi >= 73 && midi <= 85) return isDark ? 'rgba(22,163,74,0.25)' : 'rgba(34,197,94,0.12)'
    return isDark ? 'rgba(128,128,128,0.1)' : 'rgba(128,128,128,0.05)'
  }

  // 播放进度
  useEffect(() => {
    if (isPlaying) {
      playbackStartTimeRef.current = performance.now()
      const animate = () => {
        if (!isPlaying) return
        const elapsed = (performance.now() - playbackStartTimeRef.current!) / 1000
        const secondsPerBeat = 60 / track.bpm
        const currentBeat = elapsed / secondsPerBeat
        setPlayheadBeat(currentBeat)
        if (currentBeat > totalBeats) {
          setIsPlaying(false)
          stopPlayback()
          return
        }
        animationFrameRef.current = requestAnimationFrame(animate)
      }
      animationFrameRef.current = requestAnimationFrame(animate)
    } else {
      playbackStartTimeRef.current = null
      setPlayheadBeat(0)
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
        animationFrameRef.current = null
      }
    }
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [isPlaying, track.bpm, totalBeats, setIsPlaying])

  const midiToY = useCallback((midi: number) => {
    return BEAT_HEADER_HEIGHT + (MAX_MIDI - midi) * DEFAULT_ROW_HEIGHT
  }, [])

  const yToMidi = useCallback((y: number) => {
    const index = Math.floor((y - BEAT_HEADER_HEIGHT) / DEFAULT_ROW_HEIGHT)
    return MAX_MIDI - index
  }, [])

  const beatToX = useCallback((beat: number) => {
    return LEFT_PADDING + beat * pixelsPerBeat
  }, [pixelsPerBeat])

  const xToBeat = useCallback((x: number) => {
    return (x - LEFT_PADDING) / pixelsPerBeat
  }, [pixelsPerBeat])

  const findNoteAt = useCallback((x: number, y: number): Note | null => {
    for (const note of track.notes) {
      const nx = beatToX(note.startBeat)
      const ny = midiToY(getMidiNote(note.key, note.octaveShift, note.isSharp))
      const nw = note.durationBeats * pixelsPerBeat
      if (x >= nx && x <= nx + nw && y >= ny && y <= ny + DEFAULT_ROW_HEIGHT) {
        return note
      }
    }
    return null
  }, [track.notes, beatToX, midiToY, pixelsPerBeat])

  const checkOverlap = useCallback((newNote: Note, excludeIds?: Set<string>): boolean => {
    const newStart = newNote.startBeat
    const newEnd = newNote.startBeat + newNote.durationBeats
    for (const note of track.notes) {
      if (excludeIds && excludeIds.has(note.id)) continue
      const existingStart = note.startBeat
      const existingEnd = note.startBeat + note.durationBeats
      if (newStart < existingEnd && newEnd > existingStart) return true
    }
    return false
  }, [track.notes])

  const addNote = useCallback((beat: number, midi: number) => {
    const snappedBeat = Math.round(beat * 4) / 4
    const mapping = findBestMapping(midi)
    if (!mapping) return
    const newNote: Note = {
      id: `note-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      startBeat: snappedBeat,
      durationBeats: 1,
      key: mapping.key,
      octaveShift: mapping.octaveShift,
      isSharp: mapping.isSharp,
    }
    if (checkOverlap(newNote)) {
      setSnackbarMessage(t.pianoRoll.overlapError)
      setSnackbarOpen(true)
      return
    }
    addToHistory()
    setNotes(prev => [...prev, newNote])
  }, [checkOverlap, setNotes, addToHistory, t])

  // 键盘快捷键
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isCtrl = e.ctrlKey || e.metaKey

      // 空格：播放/停止
      if (e.code === 'Space' && !e.repeat && !isCtrl) {
        e.preventDefault()
        if (isPlaying) {
          stopPlayback()
          setIsPlaying(false)
        } else {
          playNotes(track.notes, track.bpm, () => setIsPlaying(false))
          setIsPlaying(true)
        }
        return
      }

      // Ctrl+Z / Ctrl+Y
      if (isCtrl && e.code === 'KeyZ' && !e.shiftKey) {
        e.preventDefault()
        undo()
        return
      }
      if (isCtrl && (e.code === 'KeyY' || (e.shiftKey && e.code === 'KeyZ'))) {
        e.preventDefault()
        redo()
        return
      }

      // Ctrl+C：复制选中
      if (isCtrl && e.code === 'KeyC') {
        if (selectedNoteIds.size > 0) {
          const selectedNotes = track.notes.filter(n => selectedNoteIds.has(n.id))
          if (selectedNotes.length > 0) {
            const minBeat = Math.min(...selectedNotes.map(n => n.startBeat))
            const midiValues = selectedNotes.map(n => getMidiNote(n.key, n.octaveShift, n.isSharp))
            const maxMidi = Math.max(...midiValues)
            const clipboardNotes: ClipboardNote[] = selectedNotes.map(n => {
              const midi = getMidiNote(n.key, n.octaveShift, n.isSharp)
              return {
                relativeBeat: n.startBeat - minBeat,
                relativeMidi: midi - maxMidi,
                durationBeats: n.durationBeats,
                key: n.key,
                octaveShift: n.octaveShift,
                isSharp: n.isSharp,
              }
            })
            setClipboard(clipboardNotes)
          }
        }
        return
      }

      // Ctrl+V：进入 ghost 模式
      if (isCtrl && e.code === 'KeyV') {
        if (clipboard && clipboard.length > 0) {
          e.preventDefault()
          setGhostMode(true)
        }
        return
      }

      // Escape：取消 ghost / 清除选择
      if (e.code === 'Escape') {
        if (ghostMode) {
          setGhostMode(false)
          return
        }
        setSelectedNoteIds(new Set())
        setSelectionRect(null)
        setSelectionMode(null)
        return
      }

      // 方向键：整体移动选中音符
      if ((e.code === 'ArrowUp' || e.code === 'ArrowDown' || e.code === 'ArrowLeft' || e.code === 'ArrowRight')
        && selectedNoteIds.size > 0 && !ghostMode) {
        e.preventDefault()
        const deltaBeat = e.code === 'ArrowLeft' ? -0.25 : e.code === 'ArrowRight' ? 0.25 : 0
        const deltaMidi = e.code === 'ArrowUp' ? 1 : e.code === 'ArrowDown' ? -1 : 0

        addToHistory()
        setNotes(prev => prev.map(n => {
          if (!selectedNoteIds.has(n.id)) return n
          if (deltaMidi !== 0) {
            const currentMidi = getMidiNote(n.key, n.octaveShift, n.isSharp)
            const targetMidi = currentMidi + deltaMidi
            if (targetMidi < MIN_MIDI || targetMidi > MAX_MIDI) return n
            const mapping = findBestMapping(targetMidi)
            if (mapping) {
              return { ...n, key: mapping.key, octaveShift: mapping.octaveShift, isSharp: mapping.isSharp }
            }
            return n
          }
          if (deltaBeat !== 0) {
            return { ...n, startBeat: Math.max(0, n.startBeat + deltaBeat) }
          }
          return n
        }))
        return
      }

      // Delete：删除选中
      if (e.code === 'Delete' && selectedNoteIds.size > 0) {
        e.preventDefault()
        addToHistory()
        setNotes(prev => prev.filter(n => !selectedNoteIds.has(n.id)))
        setSelectedNoteIds(new Set())
        return
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isPlaying, track.notes, track.bpm, setIsPlaying, undo, redo, selectedNoteIds, clipboard, ghostMode, addToHistory, setNotes])

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    if (e.ctrlKey || e.metaKey) {
      const delta = -e.deltaY * 0.01
      setPixelsPerBeat(prev => Math.max(MIN_PIXELS_PER_BEAT, Math.min(MAX_PIXELS_PER_BEAT, prev * (1 + delta))))
    } else if (e.shiftKey) {
      const container = containerRef.current
      if (container) container.scrollLeft += e.deltaY * 2
    } else {
      const container = containerRef.current
      if (container) container.scrollTop += e.deltaY
    }
  }, [])

  const clientToContent = useCallback((clientX: number, clientY: number) => {
    const container = containerRef.current
    if (!container) return { x: 0, y: 0 }
    const rect = container.getBoundingClientRect()
    return {
      x: clientX - rect.left + container.scrollLeft,
      y: clientY - rect.top + container.scrollTop,
    }
  }, [])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0 && e.button !== 2 && e.button !== 1) return
    e.preventDefault()

    const { x, y } = clientToContent(e.clientX, e.clientY)

    // Ghost 模式：左键尝试放置
    if (ghostMode && e.button === 0 && clipboard) {
      const baseBeat = xToBeat(x)
      const baseMidi = yToMidi(y)
      const snappedBase = Math.round(baseBeat * 4) / 4
      const maxMidi = baseMidi

      const newNotes: Note[] = clipboard.map((c, idx) => {
        const targetMidi = maxMidi + c.relativeMidi
        const mapping = findBestMapping(targetMidi)
        return {
          id: `note-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
          startBeat: snappedBase + c.relativeBeat,
          durationBeats: c.durationBeats,
          key: mapping ? mapping.key : c.key,
          octaveShift: mapping ? mapping.octaveShift : c.octaveShift,
          isSharp: mapping ? mapping.isSharp : c.isSharp,
        }
      })

      const allValid = newNotes.every(n => {
        const midi = getMidiNote(n.key, n.octaveShift, n.isSharp)
        if (midi < MIN_MIDI || midi > MAX_MIDI) return false
        if (n.startBeat < 0) return false
        return !checkOverlap(n)
      })

      if (allValid) {
        addToHistory()
        setNotes(prev => [...prev, ...newNotes])
        setGhostMode(false)
        setClipboard(null)
      }
      return
    }

    // Ghost 模式下右键取消
    if (ghostMode && e.button === 2) {
      setGhostMode(false)
      return
    }

    // Shift + 左键：框选
    if (e.shiftKey && e.button === 0) {
      dragStateRef.current = {
        type: 'select',
        noteId: null,
        startClientX: e.clientX,
        startClientY: e.clientY,
        startContentX: x,
        startContentY: y,
        originalStartBeat: 0,
        originalDuration: 0,
        originalMidi: 0,
      }
      setSelectionRect({ x1: x, y1: y, x2: x, y2: y })
      setSelectionMode('select')
      return
    }

    // Shift + 右键：框选删除
    if (e.shiftKey && e.button === 2) {
      dragStateRef.current = {
        type: 'deleteSelect',
        noteId: null,
        startClientX: e.clientX,
        startClientY: e.clientY,
        startContentX: x,
        startContentY: y,
        originalStartBeat: 0,
        originalDuration: 0,
        originalMidi: 0,
      }
      setSelectionRect({ x1: x, y1: y, x2: x, y2: y })
      setSelectionMode('deleteSelect')
      return
    }

    if (e.button === 0) {
      const hitNote = findNoteAt(x, y)
      if (hitNote) {
        const noteX = beatToX(hitNote.startBeat)
        const noteW = hitNote.durationBeats * pixelsPerBeat
        const isResizeLeft = Math.abs(x - noteX) <= RESIZE_ZONE
        const isResizeRight = Math.abs(x - (noteX + noteW)) <= RESIZE_ZONE
        const type = isResizeLeft ? 'resizeLeft' : isResizeRight ? 'resizeRight' : 'move'
        dragStateRef.current = {
          type,
          noteId: hitNote.id,
          startClientX: e.clientX,
          startClientY: e.clientY,
          startContentX: x,
          startContentY: y,
          originalStartBeat: hitNote.startBeat,
          originalDuration: hitNote.durationBeats,
          originalMidi: getMidiNote(hitNote.key, hitNote.octaveShift, hitNote.isSharp),
        }
        // 如果该音符不在选中集合中，则单选；若在选中集合中则保持集合（支持整体拖动）
        setSelectedNoteIds(prev => {
          if (prev.has(hitNote.id)) return prev
          return new Set([hitNote.id])
        })
      } else {
        const beat = xToBeat(x)
        const midi = yToMidi(y)
        if (midi >= MIN_MIDI && midi <= MAX_MIDI && beat >= 0) {
          dragStateRef.current = {
            type: 'create',
            noteId: null,
            startClientX: e.clientX,
            startClientY: e.clientY,
            startContentX: x,
            startContentY: y,
            originalStartBeat: 0,
            originalDuration: 0,
            originalMidi: midi,
          }
          // 点击空白区域，清空选择（如果没有按 shift）
          setSelectedNoteIds(new Set())
        }
      }
    } else if (e.button === 2) {
      // 若当前存在选择，第一次右键退出框选状态（不删除）
      if (selectedNoteIds.size > 0) {
        setSelectedNoteIds(new Set())
        return
      }
      const hitNote = findNoteAt(x, y)
      if (hitNote) {
        addToHistory()
        setNotes(prev => prev.filter(n => n.id !== hitNote.id))
      }
    } else if (e.button === 1) {
      const hitNote = findNoteAt(x, y)
      if (hitNote) {
        addToHistory()
        setNotes(prev => prev.map(n => n.id === hitNote.id ? { ...n, isSharp: !n.isSharp } : n))
      }
    }
  }, [ghostMode, clipboard, selectedNoteIds, clientToContent, xToBeat, yToMidi, findNoteAt, beatToX, pixelsPerBeat, checkOverlap, addToHistory, setNotes])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const drag = dragStateRef.current
    const { x, y } = clientToContent(e.clientX, e.clientY)

    if (ghostMode) {
      setGhostPos({ x, y })
      return
    }

    if (drag.type === 'select' || drag.type === 'deleteSelect') {
      setSelectionRect({
        x1: drag.startContentX,
        y1: drag.startContentY,
        x2: x,
        y2: y,
      })
      return
    }

    if (drag.type === 'none') {
      const hitNote = findNoteAt(x, y)
      setHoveredNoteId(hitNote?.id ?? null)
      if (hitNote) {
        const noteX = beatToX(hitNote.startBeat)
        const noteW = hitNote.durationBeats * pixelsPerBeat
        const isLeft = Math.abs(x - noteX) <= RESIZE_ZONE
        const isRight = Math.abs(x - (noteX + noteW)) <= RESIZE_ZONE
        setHoverCursor(isLeft || isRight ? 'ew-resize' : 'move')
      } else {
        setHoverCursor('crosshair')
      }
      return
    }

    if (drag.type === 'move' && drag.noteId) {
      const deltaX = e.clientX - drag.startClientX
      const deltaY = e.clientY - drag.startClientY
      const deltaBeat = deltaX / pixelsPerBeat
      const newStart = Math.max(0, drag.originalStartBeat + deltaBeat)
      const snappedStart = Math.round(newStart * 4) / 4
      const midiDelta = Math.round(-deltaY / DEFAULT_ROW_HEIGHT)
      const newMidi = Math.max(MIN_MIDI, Math.min(MAX_MIDI, drag.originalMidi + midiDelta))
      const mapping = findBestMapping(newMidi)
      if (mapping) {
        setNotes(prev => prev.map(n => n.id === drag.noteId ? { ...n, startBeat: snappedStart, key: mapping.key, octaveShift: mapping.octaveShift, isSharp: mapping.isSharp } : n))
      }
    } else if (drag.type === 'resizeRight' && drag.noteId) {
      const deltaX = e.clientX - drag.startClientX
      const deltaBeat = deltaX / pixelsPerBeat
      const newDuration = Math.max(0.25, drag.originalDuration + deltaBeat)
      setNotes(prev => prev.map(n => n.id === drag.noteId ? { ...n, durationBeats: Math.round(newDuration * 4) / 4 } : n))
    } else if (drag.type === 'resizeLeft' && drag.noteId) {
      const deltaX = e.clientX - drag.startClientX
      const deltaBeat = deltaX / pixelsPerBeat
      const newStart = Math.max(0, drag.originalStartBeat + deltaBeat)
      const snappedStart = Math.round(newStart * 4) / 4
      const newDuration = Math.max(0.25, drag.originalDuration - deltaBeat)
      setNotes(prev => prev.map(n => n.id === drag.noteId ? { ...n, startBeat: snappedStart, durationBeats: Math.round(newDuration * 4) / 4 } : n))
    }
  }, [ghostMode, clientToContent, findNoteAt, beatToX, pixelsPerBeat, setNotes])

  const handleMouseUp = useCallback(() => {
    const drag = dragStateRef.current
    if ((drag.type === 'select' || drag.type === 'deleteSelect') && selectionRect) {
      const x1 = Math.min(selectionRect.x1, selectionRect.x2)
      const x2 = Math.max(selectionRect.x1, selectionRect.x2)
      const y1 = Math.min(selectionRect.y1, selectionRect.y2)
      const y2 = Math.max(selectionRect.y1, selectionRect.y2)

      const affected = new Set<string>()
      for (const note of track.notes) {
        const nx = beatToX(note.startBeat)
        const ny = midiToY(getMidiNote(note.key, note.octaveShift, note.isSharp))
        const nw = note.durationBeats * pixelsPerBeat
        const nh = DEFAULT_ROW_HEIGHT
        if (nx < x2 && nx + nw > x1 && ny < y2 && ny + nh > y1) {
          affected.add(note.id)
        }
      }

      if (drag.type === 'select') {
        setSelectedNoteIds(affected)
      } else {
        if (affected.size > 0) {
          addToHistory()
          setNotes(prev => prev.filter(n => !affected.has(n.id)))
          setSelectedNoteIds(new Set())
        }
      }
      setSelectionRect(null)
      setSelectionMode(null)
    } else if (drag.type === 'create') {
      const container = containerRef.current
      if (container) {
        const rect = container.getBoundingClientRect()
        const contentX = drag.startClientX - rect.left + container.scrollLeft
        const contentY = drag.startClientY - rect.top + container.scrollTop
        const beat = xToBeat(contentX)
        const midi = yToMidi(contentY)
        addNote(beat, midi)
      }
    } else if (drag.type === 'move' || drag.type === 'resizeLeft' || drag.type === 'resizeRight') {
      if (drag.noteId) {
        const draggedNote = track.notes.find(n => n.id === drag.noteId)
        if (draggedNote && checkOverlap(draggedNote, selectedNoteIds.size > 0 ? selectedNoteIds : new Set([drag.noteId]))) {
          setNotes(prev => prev.map(n => n.id === draggedNote.id ? { ...n, startBeat: drag.originalStartBeat, durationBeats: drag.originalDuration } : n))
          setSnackbarMessage(t.pianoRoll.overlapError)
          setSnackbarOpen(true)
        } else {
          addToHistory()
        }
      }
    }
    dragStateRef.current = { type: 'none', noteId: null, startClientX: 0, startClientY: 0, startContentX: 0, startContentY: 0, originalStartBeat: 0, originalDuration: 0, originalMidi: 0 }
  }, [selectionRect, track.notes, beatToX, midiToY, pixelsPerBeat, addToHistory, setNotes, xToBeat, yToMidi, addNote, checkOverlap, selectedNoteIds, t])

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
  }, [])

  const getNoteStyle = (note: Note, isHovered: boolean): React.CSSProperties => {
    const midi = getMidiNote(note.key, note.octaveShift, note.isSharp)
    const x = beatToX(note.startBeat)
    const y = midiToY(midi)
    const w = Math.max(4, note.durationBeats * pixelsPerBeat - 2)
    const h = DEFAULT_ROW_HEIGHT - 2
    const isSelected = selectedNoteIds.has(note.id)

    let backgroundColor = isDark ? '#52525b' : '#71717a'
    if (note.isSharp) {
      backgroundColor = isDark ? '#3f3f46' : '#a1a1aa'
    }
    if (isHovered) {
      backgroundColor = isDark ? '#63636b' : '#888891'
    }

    return {
      position: 'absolute',
      left: x + 1,
      top: y + 1,
      width: w,
      height: h,
      background: backgroundColor,
      border: isSelected ? '2px solid #7c3aed' : '1px solid rgba(0,0,0,0.4)',
      borderRadius: 4,
      cursor: hoverCursor,
      userSelect: 'none',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: Math.max(10, DEFAULT_ROW_HEIGHT * 0.45),
      fontWeight: 'bold',
      color: '#fff',
      boxSizing: 'border-box',
      zIndex: isSelected ? 10 : 5,
      pointerEvents: 'auto',
    }
  }

  // 左侧标签：点击后持续播放
  const handleLabelMouseDown = useCallback((midi: number) => {
    setPreviewMidi(midi)
    startPreviewNote(midi)
  }, [])

  const handleLabelMouseUp = useCallback(() => {
    setPreviewMidi(null)
    stopPreviewNote()
  }, [])

  const rows = useMemo(() => {
    const result: React.ReactNode[] = []
    for (let midi = MIN_MIDI; midi <= MAX_MIDI; midi++) {
      const y = midiToY(midi)
      const bgColor = getRowColor(midi)
      const isPreview = previewMidi === midi
      result.push(
        <div key={midi} style={{ position: 'absolute', left: LEFT_PADDING, top: y, width: totalContentWidth - LEFT_PADDING, height: DEFAULT_ROW_HEIGHT, background: bgColor, borderBottom: '1px solid rgba(127,127,127,0.15)', userSelect: 'none', pointerEvents: 'none' }} />,
      )
      const label = getJianpuLabel(midi)
      result.push(
        <div
          key={`label-${midi}`}
          style={{
            position: 'absolute',
            left: 0,
            top: y,
            width: LEFT_PADDING - 4,
            height: DEFAULT_ROW_HEIGHT,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            fontSize: 12,
            fontWeight: 500,
            color: isPreview
              ? '#fff'
              : (isDark ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.7)'),
            background: isPreview ? 'rgba(124,58,237,0.9)' : 'transparent',
            fontFamily: 'Inter, system-ui, sans-serif',
            userSelect: 'none',
            cursor: 'pointer',
            paddingRight: 4,
            borderRadius: 4,
            transition: 'background 0.05s',
          }}
          onMouseDown={(e) => { e.stopPropagation(); handleLabelMouseDown(midi) }}
          onMouseUp={handleLabelMouseUp}
          onMouseLeave={handleLabelMouseUp}
          title={`Play ${label}`}
        >
          {label}
        </div>,
      )
    }
    return result
  }, [midiToY, totalContentWidth, isDark, previewMidi, handleLabelMouseDown, handleLabelMouseUp])

  const beatLines = useMemo(() => {
    const result: React.ReactNode[] = []
    for (let beat = 0; beat <= totalBeats; beat++) {
      const x = beatToX(beat)
      const isBar = beat % track.beatsPerBar === 0
      result.push(
        <div key={`beat-${beat}`} style={{ position: 'absolute', left: x, top: BEAT_HEADER_HEIGHT, width: isBar ? 1.5 : 0.5, height: totalContentHeight - BEAT_HEADER_HEIGHT, background: isDark ? (isBar ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.08)') : (isBar ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.08)'), userSelect: 'none', pointerEvents: 'none' }} />,
      )
      if (isBar) {
        result.push(
          <div key={`bar-label-${beat}`} style={{ position: 'absolute', left: x + 2, top: 4, fontSize: 11, fontWeight: 600, color: isDark ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.7)', userSelect: 'none', pointerEvents: 'none' }}>{beat / track.beatsPerBar + 1}</div>,
        )
      }
    }
    return result
  }, [totalBeats, beatToX, track.beatsPerBar, totalContentHeight, isDark])

  const playheadX = beatToX(playheadBeat)

  const selectionStyle: React.CSSProperties | null = selectionRect ? {
    position: 'absolute',
    left: Math.min(selectionRect.x1, selectionRect.x2),
    top: Math.min(selectionRect.y1, selectionRect.y2),
    width: Math.abs(selectionRect.x2 - selectionRect.x1),
    height: Math.abs(selectionRect.y2 - selectionRect.y1),
    background: selectionMode === 'deleteSelect' ? 'rgba(239,68,68,0.2)' : 'rgba(124,58,237,0.15)',
    border: selectionMode === 'deleteSelect' ? '1px solid rgba(239,68,68,0.5)' : '1px solid rgba(124,58,237,0.5)',
    pointerEvents: 'none',
    zIndex: 30,
  } : null

  const ghostNotes = useMemo(() => {
    if (!ghostMode || !ghostPos || !clipboard) return []
    const baseBeat = xToBeat(ghostPos.x)
    const baseMidi = yToMidi(ghostPos.y)
    const snappedBase = Math.round(baseBeat * 4) / 4
    const maxMidi = baseMidi

    return clipboard.map((c, idx) => {
      const targetMidi = maxMidi + c.relativeMidi
      const mapping = findBestMapping(targetMidi)
      return {
        id: `ghost-${idx}`,
        startBeat: snappedBase + c.relativeBeat,
        durationBeats: c.durationBeats,
        key: mapping ? mapping.key : c.key,
        octaveShift: mapping ? mapping.octaveShift : c.octaveShift,
        isSharp: mapping ? mapping.isSharp : c.isSharp,
      } as Note
    })
  }, [ghostMode, ghostPos, clipboard, xToBeat, yToMidi])

  return (
    <Box sx={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
      <div
        ref={containerRef}
        style={{ width: '100%', height: '100%', overflow: 'auto', userSelect: 'none', cursor: hoverCursor, position: 'relative' }}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => {
          handleMouseUp()
          handleLabelMouseUp()
        }}
        onContextMenu={handleContextMenu}
      >
        <div style={{ position: 'relative', width: totalContentWidth, height: totalContentHeight, background: isDark ? '#18181b' : '#fafafa' }}>
          {rows}
          {beatLines}
          {track.notes.map((note) => {
            const isHovered = note.id === hoveredNoteId
            const midi = getMidiNote(note.key, note.octaveShift, note.isSharp)
            const jianpu = getJianpuLabel(midi)
            return (
              <div key={note.id} style={getNoteStyle(note, isHovered)} onMouseEnter={() => setHoveredNoteId(note.id)} onMouseLeave={() => setHoveredNoteId(null)}>
                {note.durationBeats * pixelsPerBeat > 30 ? jianpu : ''}
              </div>
            )
          })}
          {ghostNotes.map((note) => {
            const midi = getMidiNote(note.key, note.octaveShift, note.isSharp)
            const x = beatToX(note.startBeat)
            const y = midiToY(midi)
            const w = Math.max(4, note.durationBeats * pixelsPerBeat - 2)
            return (
              <div key={note.id} style={{ position: 'absolute', left: x + 1, top: y + 1, width: w, height: DEFAULT_ROW_HEIGHT - 2, background: 'rgba(124,58,237,0.4)', border: '1px dashed #7c3aed', borderRadius: 4, pointerEvents: 'none', zIndex: 25 }} />
            )
          })}
          {selectionStyle && <div style={selectionStyle} />}
          {isPlaying && (
            <div style={{ position: 'absolute', left: playheadX, top: BEAT_HEADER_HEIGHT, width: 2, height: totalContentHeight - BEAT_HEADER_HEIGHT, background: '#7c3aed', pointerEvents: 'none', zIndex: 20 }} />
          )}
        </div>
      </div>
      <Snackbar open={snackbarOpen} autoHideDuration={3000} onClose={() => setSnackbarOpen(false)} anchorOrigin={{ vertical: 'top', horizontal: 'center' }}>
        <Alert severity="error" onClose={() => setSnackbarOpen(false)}>{snackbarMessage}</Alert>
      </Snackbar>
    </Box>
  )
}