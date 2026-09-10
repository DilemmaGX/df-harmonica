import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Box, Alert, Snackbar, useTheme } from '@mui/material'
import type { Note } from '../types'
import { getMidiNote, findBestMapping, MIN_MIDI, MAX_MIDI, getJianpuLabel } from '../utils/noteMapping'
import { useAppContext } from '../contexts/AppContext'
import { getTranslations } from '../i18n/translations'
import { playNotes, stopPlayback, startPreviewNote, stopPreviewNote } from '../utils/audio'
import { NOTE_COLORS } from './KeyboardScore'

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

/** 起始小节指示器颜色（翠绿，与播放头紫色区分） */
const PLAY_START_MARKER_COLOR = '#10b981'

/** hex → rgba 字符串 */
function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

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
  originalNotes: Note[]
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

/** 判断事件目标是否为可编辑区域（输入框 / 文本域 / 下拉框 / contentEditable） */
function isEditableTarget(el: EventTarget | null): boolean {
  const node = el as HTMLElement | null
  if (!node) return false
  const tag = node.tagName
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    node.isContentEditable
  )
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
    playStartBeat,
    setPlayStartBeat,
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
  const [isDraggingMarker, setIsDraggingMarker] = useState(false)

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
    originalNotes: [],
  })
  const playbackStartTimeRef = useRef<number | null>(null)
  const playbackStartBeatRef = useRef(0)
  const animationFrameRef = useRef<number | null>(null)
  const [playheadBeat, setPlayheadBeat] = useState(0)
  const markerDragRef = useRef(false)

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

  // 行背景色：低八度橙、默认紫、高八度天蓝（与键盘谱 / 模拟器三色一致）
  const getRowColor = (midi: number): string => {
    if (midi === 60 || midi === 72) {
      return isDark ? 'rgba(128,128,128,0.25)' : 'rgba(128,128,128,0.15)'
    }
    if (midi >= 48 && midi <= 59) {
      return hexToRgba(NOTE_COLORS.low, isDark ? 0.25 : 0.12)
    }
    if (midi >= 61 && midi <= 71) {
      return hexToRgba(NOTE_COLORS.default, isDark ? 0.25 : 0.12)
    }
    if (midi >= 73 && midi <= 85) {
      return hexToRgba(NOTE_COLORS.high, isDark ? 0.25 : 0.12)
    }
    return isDark ? 'rgba(128,128,128,0.1)' : 'rgba(128,128,128,0.05)'
  }

  // 播放进度：从 playStartBeat 起算
  useEffect(() => {
    if (isPlaying) {
      playbackStartBeatRef.current = playStartBeat
      playbackStartTimeRef.current = performance.now()
      const animate = () => {
        if (playbackStartTimeRef.current === null) return
        const elapsed =
          (performance.now() - playbackStartTimeRef.current) / 1000
        const secondsPerBeat = 60 / track.bpm
        const currentBeat =
          playbackStartBeatRef.current + elapsed / secondsPerBeat
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
      setPlayheadBeat(playStartBeat)
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
  }, [isPlaying, track.bpm, totalBeats, setIsPlaying, playStartBeat])

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
      // 正在输入框 / 文本域 / contentEditable 中打字（含 IME 组合输入）→ 完全让行
      if (isEditableTarget(e.target) || e.isComposing) return

      const isCtrl = e.ctrlKey || e.metaKey

      // 空格：播放/停止（从起始小节指示器所在拍开始）
      if (e.code === 'Space' && !e.repeat && !isCtrl) {
        e.preventDefault()
        if (isPlaying) {
          stopPlayback()
          setIsPlaying(false)
        } else {
          playNotes(
            track.notes,
            track.bpm,
            () => setIsPlaying(false),
            playStartBeat,
          )
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
  }, [isPlaying, track.notes, track.bpm, setIsPlaying, undo, redo, selectedNoteIds, clipboard, ghostMode, addToHistory, setNotes, playStartBeat])

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

  // 起始小节指示器：按下开始拖拽
  const handleMarkerMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    markerDragRef.current = true
    setIsDraggingMarker(true)
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
        originalNotes: [],
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
        originalNotes: [],
      }
      setSelectionRect({ x1: x, y1: y, x2: x, y2: y })
      setSelectionMode('deleteSelect')
      return
    }

    if (e.button === 0) {
      const hitNote = findNoteAt(x, y)
      if (hitNote) {
        const isSelected = selectedNoteIds.has(hitNote.id)
        const isMultiSelected = isSelected && selectedNoteIds.size > 1
        const noteX = beatToX(hitNote.startBeat)
        const noteW = hitNote.durationBeats * pixelsPerBeat
        const isResizeLeft = Math.abs(x - noteX) <= RESIZE_ZONE
        const isResizeRight = Math.abs(x - (noteX + noteW)) <= RESIZE_ZONE
        // 多选时，在任意选中音符上拖动都进入整体移动；单选时保留边缘缩放
        const type = isMultiSelected ? 'move' : (isResizeLeft ? 'resizeLeft' : isResizeRight ? 'resizeRight' : 'move')
        const notesForDrag = isSelected
          ? track.notes.filter(n => selectedNoteIds.has(n.id))
          : [hitNote]

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
          originalNotes: notesForDrag.map(n => ({ ...n })),
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
            originalNotes: [],
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
  }, [ghostMode, clipboard, selectedNoteIds, track.notes, clientToContent, xToBeat, yToMidi, findNoteAt, beatToX, pixelsPerBeat, checkOverlap, addToHistory, setNotes])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    // 起始小节指示器拖拽：吸附到最近小节开头
    if (markerDragRef.current) {
      const { x } = clientToContent(e.clientX, e.clientY)
      const bpb = track.beatsPerBar || 4
      const maxBarIndex = Math.max(0, Math.round(totalBeats / bpb) - 1)
      const rawBar = xToBeat(x) / bpb
      const barIndex = Math.max(0, Math.min(maxBarIndex, Math.round(rawBar)))
      setPlayStartBeat(barIndex * bpb)
      return
    }

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
        const isSelected = selectedNoteIds.has(hitNote.id)
        const isMultiSelected = isSelected && selectedNoteIds.size > 1
        if (isMultiSelected) {
          // 多选整体移动：显示移动十字箭头
          setHoverCursor('move')
        } else {
          const noteX = beatToX(hitNote.startBeat)
          const noteW = hitNote.durationBeats * pixelsPerBeat
          const isLeft = Math.abs(x - noteX) <= RESIZE_ZONE
          const isRight = Math.abs(x - (noteX + noteW)) <= RESIZE_ZONE
          setHoverCursor(isLeft || isRight ? 'ew-resize' : 'move')
        }
      } else {
        setHoverCursor('crosshair')
      }
      return
    }

    if (drag.type === 'move' && drag.originalNotes.length > 0) {
      const deltaX = e.clientX - drag.startClientX
      const deltaY = e.clientY - drag.startClientY
      const rawDeltaBeat = deltaX / pixelsPerBeat
      const rawMidiDelta = Math.round(-deltaY / DEFAULT_ROW_HEIGHT)

      const originalNotes = drag.originalNotes
      const minStart = Math.min(...originalNotes.map(n => n.startBeat))
      let deltaBeat = rawDeltaBeat
      if (minStart + deltaBeat < 0) deltaBeat = -minStart

      const midiValues = originalNotes.map(n => getMidiNote(n.key, n.octaveShift, n.isSharp))
      const minMidi = Math.min(...midiValues)
      const maxMidi = Math.max(...midiValues)
      let midiDelta = rawMidiDelta
      if (minMidi + midiDelta < MIN_MIDI) midiDelta = MIN_MIDI - minMidi
      if (maxMidi + midiDelta > MAX_MIDI) midiDelta = MAX_MIDI - maxMidi

      const snappedDeltaBeat = Math.round(deltaBeat * 4) / 4
      const originalMap = new Map(originalNotes.map(n => [n.id, n]))

      setNotes(prev => prev.map(n => {
        const orig = originalMap.get(n.id)
        if (!orig) return n
        const newStart = Math.max(0, orig.startBeat + snappedDeltaBeat)
        const currentMidi = getMidiNote(orig.key, orig.octaveShift, orig.isSharp)
        const newMidi = currentMidi + midiDelta
        const mapping = findBestMapping(newMidi)
        if (!mapping) return n
        return {
          ...n,
          startBeat: newStart,
          key: mapping.key,
          octaveShift: mapping.octaveShift,
          isSharp: mapping.isSharp,
        }
      }))
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
  }, [ghostMode, clientToContent, findNoteAt, beatToX, pixelsPerBeat, setNotes, selectedNoteIds, track.beatsPerBar, totalBeats, xToBeat, setPlayStartBeat])

  const handleMouseUp = useCallback(() => {
    // 起始小节指示器拖拽结束
    if (markerDragRef.current) {
      markerDragRef.current = false
      setIsDraggingMarker(false)
      return
    }

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
    } else if (drag.type === 'move') {
      const movedIds = new Set(drag.originalNotes.map(n => n.id))
      if (movedIds.size > 0) {
        const movedNotes = track.notes.filter(n => movedIds.has(n.id))
        const hasOverlap = movedNotes.some(n => checkOverlap(n, movedIds))
        if (hasOverlap) {
          const originalMap = new Map(drag.originalNotes.map(n => [n.id, n]))
          setNotes(prev => prev.map(n => {
            const orig = originalMap.get(n.id)
            return orig
              ? { ...n, startBeat: orig.startBeat, durationBeats: orig.durationBeats, key: orig.key, octaveShift: orig.octaveShift, isSharp: orig.isSharp }
              : n
          }))
          setSnackbarMessage(t.pianoRoll.overlapError)
          setSnackbarOpen(true)
        } else {
          addToHistory()
        }
      }
    } else if (drag.type === 'resizeLeft' || drag.type === 'resizeRight') {
      if (drag.noteId) {
        const draggedNote = track.notes.find(n => n.id === drag.noteId)
        if (draggedNote && checkOverlap(draggedNote, new Set([drag.noteId]))) {
          setNotes(prev => prev.map(n => n.id === draggedNote.id ? { ...n, startBeat: drag.originalStartBeat, durationBeats: drag.originalDuration } : n))
          setSnackbarMessage(t.pianoRoll.overlapError)
          setSnackbarOpen(true)
        } else {
          addToHistory()
        }
      }
    }
    dragStateRef.current = {
      type: 'none',
      noteId: null,
      startClientX: 0,
      startClientY: 0,
      startContentX: 0,
      startContentY: 0,
      originalStartBeat: 0,
      originalDuration: 0,
      originalMidi: 0,
      originalNotes: [],
    }
  }, [selectionRect, track.notes, beatToX, midiToY, pixelsPerBeat, addToHistory, setNotes, xToBeat, yToMidi, addNote, checkOverlap, t])

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
      border: isSelected ? `2px solid ${NOTE_COLORS.default}` : '1px solid rgba(0,0,0,0.4)',
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

  // 每行的背景色块，铺在主内容区（不含左侧标签）
  const rowBackgrounds = useMemo(() => {
    const result: React.ReactNode[] = []
    for (let midi = MIN_MIDI; midi <= MAX_MIDI; midi++) {
      const y = midiToY(midi)
      const bgColor = getRowColor(midi)
      result.push(
        <div key={midi} style={{ position: 'absolute', left: LEFT_PADDING, top: y, width: totalContentWidth - LEFT_PADDING, height: DEFAULT_ROW_HEIGHT, background: bgColor, borderBottom: '1px solid rgba(127,127,127,0.15)', userSelect: 'none', pointerEvents: 'none' }} />,
      )
    }
    return result
  }, [midiToY, totalContentWidth, isDark])

  // 左侧音高标签：使用 position: sticky 使水平滚动时常驻左侧
  const rowLabels = useMemo(() => {
    const result: React.ReactNode[] = []
    for (let i = 0; i <= MAX_MIDI - MIN_MIDI; i++) {
      const midi = MAX_MIDI - i
      const label = getJianpuLabel(midi)
      const isPreview = previewMidi === midi
      result.push(
        <div key={`label-${midi}`} style={{ height: DEFAULT_ROW_HEIGHT, pointerEvents: 'none' }}>
          <div
            style={{
              position: 'sticky',
              left: 0,
              width: LEFT_PADDING - 4,
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              paddingRight: 4,
              fontSize: 12,
              fontWeight: 500,
              color: isPreview
                ? '#fff'
                : (isDark ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.7)'),
              background: isPreview
                ? hexToRgba(NOTE_COLORS.default, 0.9)
                : (isDark ? '#18181b' : '#fafafa'),
              fontFamily: 'Inter, system-ui, sans-serif',
              userSelect: 'none',
              cursor: 'pointer',
              borderRadius: 4,
              pointerEvents: 'auto',
            }}
            onMouseDown={(e) => { e.stopPropagation(); handleLabelMouseDown(midi) }}
            onMouseUp={handleLabelMouseUp}
            onMouseLeave={handleLabelMouseUp}
            title={`Play ${label}`}
          >
            {label}
          </div>
        </div>,
      )
    }
    return result
  }, [isDark, previewMidi, handleLabelMouseDown, handleLabelMouseUp])

  // 垂直线（在内容区滚动）
  const beatLines = useMemo(() => {
    const result: React.ReactNode[] = []
    for (let beat = 0; beat <= totalBeats; beat++) {
      const x = beatToX(beat)
      const isBar = beat % track.beatsPerBar === 0
      result.push(
        <div key={`beat-${beat}`} style={{ position: 'absolute', left: x, top: BEAT_HEADER_HEIGHT, width: isBar ? 1.5 : 0.5, height: totalContentHeight - BEAT_HEADER_HEIGHT, background: isDark ? (isBar ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.08)') : (isBar ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.08)'), userSelect: 'none', pointerEvents: 'none' }} />,
      )
    }
    return result
  }, [totalBeats, beatToX, track.beatsPerBar, totalContentHeight, isDark])

  // 顶部小节号（使用 position: sticky 使垂直滚动时常驻顶部）
  const barLabels = useMemo(() => {
    const result: React.ReactNode[] = []
    for (let beat = 0; beat <= totalBeats; beat++) {
      const isBar = beat % track.beatsPerBar === 0
      if (isBar) {
        const x = beatToX(beat)
        result.push(
          <div
            key={`bar-label-${beat}`}
            style={{
              position: 'absolute',
              left: x + 2,
              top: 4,
              fontSize: 11,
              fontWeight: 600,
              color: isDark ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.7)',
              userSelect: 'none',
              pointerEvents: 'none',
            }}
          >
            {beat / track.beatsPerBar + 1}
          </div>,
        )
      }
    }
    return result
  }, [totalBeats, beatToX, track.beatsPerBar, isDark])

  const playheadX = beatToX(playheadBeat)

  const selectionStyle: React.CSSProperties | null = selectionRect ? {
    position: 'absolute',
    left: Math.min(selectionRect.x1, selectionRect.x2),
    top: Math.min(selectionRect.y1, selectionRect.y2),
    width: Math.abs(selectionRect.x2 - selectionRect.x1),
    height: Math.abs(selectionRect.y2 - selectionRect.y1),
    background: selectionMode === 'deleteSelect'
      ? 'rgba(239,68,68,0.2)'
      : hexToRgba(NOTE_COLORS.default, 0.15),
    border: selectionMode === 'deleteSelect'
      ? '1px solid rgba(239,68,68,0.5)'
      : `1px solid ${hexToRgba(NOTE_COLORS.default, 0.5)}`,
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

  const bgColor = isDark ? '#18181b' : '#fafafa'

  // 起始小节指示器显示的小节号（1 起）
  const markerBarNumber = playStartBeat / (track.beatsPerBar || 4) + 1
  // 指示器的水平位置（跟随内容横向滚动）
  const markerLeft = beatToX(playStartBeat)

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
        <div style={{ position: 'relative', width: totalContentWidth, height: totalContentHeight, background: bgColor }}>

          {/* 1. 底层：行背景、拍号线 */}
          {rowBackgrounds}
          {beatLines}

          {/* 2. 中层：音符、ghost、选择框、播放头 */}
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
              <div key={note.id} style={{ position: 'absolute', left: x + 1, top: y + 1, width: w, height: DEFAULT_ROW_HEIGHT - 2, background: hexToRgba(NOTE_COLORS.default, 0.4), border: `1px dashed ${NOTE_COLORS.default}`, borderRadius: 4, pointerEvents: 'none', zIndex: 25 }} />
            )
          })}
          {selectionStyle && <div style={selectionStyle} />}
          {/* 播放头：停止时停在起始小节位置，播放中随进度移动 */}
          <div style={{ position: 'absolute', left: playheadX, top: BEAT_HEADER_HEIGHT, width: 2, height: totalContentHeight - BEAT_HEADER_HEIGHT, background: NOTE_COLORS.default, pointerEvents: 'none', zIndex: 20 }} />

          {/* 3. 左侧音高标签：水平方向 sticky */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: totalContentWidth,
              height: totalContentHeight,
              pointerEvents: 'none',
              zIndex: 15,
            }}
          >
            <div style={{ height: BEAT_HEADER_HEIGHT }} />
            {rowLabels}
          </div>

          {/* 4. 顶部小节号：垂直方向 sticky */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: totalContentWidth,
              height: totalContentHeight,
              pointerEvents: 'none',
              zIndex: 25,
            }}
          >
            <div
              style={{
                position: 'sticky',
                top: 0,
                height: BEAT_HEADER_HEIGHT,
                width: '100%',
                background: bgColor,
                pointerEvents: 'auto',
              }}
            >
              {barLabels}
            </div>
          </div>

          {/* 5. 左上角：两个方向都 sticky */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: totalContentWidth,
              height: totalContentHeight,
              pointerEvents: 'none',
              zIndex: 35,
            }}
          >
            <div
              style={{
                position: 'sticky',
                top: 0,
                left: 0,
                width: LEFT_PADDING,
                height: BEAT_HEADER_HEIGHT,
                background: bgColor,
                pointerEvents: 'auto',
              }}
            />
          </div>

          {/*
            6. 起始小节指示器：
               - 外层全尺寸绝对定位容器负责建立 sticky 边界
               - 内层元素使用 position: sticky; top: 2，因此垂直滚动时固定在顶部
               - 水平方向通过 marginLeft 定位，随内容一起水平滚动
          */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: totalContentWidth,
              height: totalContentHeight,
              pointerEvents: 'none',
              zIndex: 40,
            }}
          >
            <div
              onMouseDown={handleMarkerMouseDown}
              title={t.pianoRoll.playStartBar}
              style={{
                position: 'sticky',
                top: 2,
                marginLeft: markerLeft,
                width: 'fit-content',
                height: BEAT_HEADER_HEIGHT - 6,
                minWidth: 26,
                padding: '0 6px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: PLAY_START_MARKER_COLOR,
                color: '#fff',
                fontSize: 11,
                fontWeight: 700,
                fontFamily: 'Inter, system-ui, sans-serif',
                borderRadius: 4,
                boxSizing: 'border-box',
                cursor: isDraggingMarker ? 'grabbing' : 'grab',
                userSelect: 'none',
                pointerEvents: 'auto',
                boxShadow: isDraggingMarker
                  ? '0 0 0 3px rgba(16,185,129,0.35), 0 4px 10px rgba(0,0,0,0.3)'
                  : '0 2px 5px rgba(0,0,0,0.2)',
                transition: 'box-shadow 0.15s ease',
              }}
            >
              {markerBarNumber}
            </div>
          </div>

        </div>
      </div>
      <Snackbar open={snackbarOpen} autoHideDuration={3000} onClose={() => setSnackbarOpen(false)} anchorOrigin={{ vertical: 'top', horizontal: 'center' }}>
        <Alert severity="error" onClose={() => setSnackbarOpen(false)}>{snackbarMessage}</Alert>
      </Snackbar>
    </Box>
  )
}