import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Box, Paper, Stack, useTheme } from '@mui/material'
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown'
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp'
import { useAppContext } from '../contexts/AppContext'
import { getJianpuLabel, KEY_DISPLAY } from '../utils/noteMapping'
import { startKeyNote, stopKeyNote } from '../utils/audio'
import type { HarmonicaKey } from '../types'
import { KeyboardScore, NOTE_COLORS } from './KeyboardScore'

/** 与钢琴卷帘 / 键盘谱一致的 8 个基础键 */
const SIM_KEYS: HarmonicaKey[] = ['z', 'x', 'c', 'v', 'b', 'n', 'm', ',']

/** 基础 MIDI（不含八度/半音偏移）：z=C4(中央1) ... ,=C5(高八度1) */
const BASE_MIDI: Record<HarmonicaKey, number> = {
  z: 60,
  x: 62,
  c: 64,
  v: 65,
  b: 67,
  n: 69,
  m: 71,
  ',': 72,
}

/** 中键（升半音）指示器用的蓝色，区别于上述三种八度配色 */
const COLOR_MID = '#0ea5e9'

/** 键盘谱叠加层的高度（含内边距） */
const SCORE_PANEL_HEIGHT = 320

interface KeyboardSimulatorProps {
  /** 是否显示键盘谱（由 Toolbar 控制） */
  showScore: boolean
}

export function KeyboardSimulator({ showScore }: KeyboardSimulatorProps) {
  const { track, notes } = useAppContext()
  const theme = useTheme()
  const isDark = theme.palette.mode === 'dark'

  // 中键描边色：浅色→黑，深色→白
  const sharpBorderColor = isDark ? '#ffffff' : '#000000'

  // 单音模式：仅保留最后一个按下的键（后输入覆盖前输入）
  const [activeKey, setActiveKey] = useState<HarmonicaKey | null>(null)
  // 鼠标按键栈：栈顶为「后按生效」；中键（1）独立叠加在栈中
  const [mouseButtonStack, setMouseButtonStack] = useState<number[]>([])

  const currentIdRef = useRef<string | null>(null)

  const isMiddlePressed = mouseButtonStack.includes(1)

  // 左右键「后按覆盖」：从栈顶向下找第一个 0 / 2
  const octaveDir = useMemo<'left' | 'right' | null>(() => {
    for (let i = mouseButtonStack.length - 1; i >= 0; i--) {
      const b = mouseButtonStack[i]
      if (b === 0) return 'left'
      if (b === 2) return 'right'
    }
    return null
  }, [mouseButtonStack])

  const octaveShift = octaveDir === 'left' ? -1 : octaveDir === 'right' ? 1 : 0
  const isSharp = isMiddlePressed

  // 键帽底色 = 当前八度方向（与键盘谱音符块配色一致；中键不改底色）
  const capFill =
    octaveDir === 'left'
      ? NOTE_COLORS.low
      : octaveDir === 'right'
        ? NOTE_COLORS.high
        : NOTE_COLORS.default

  const getMidi = useCallback(
    (key: HarmonicaKey) => BASE_MIDI[key] + octaveShift * 12 + (isSharp ? 1 : 0),
    [octaveShift, isSharp],
  )

  const keyLabels = useMemo(
    () =>
      SIM_KEYS.map(key => ({
        key,
        jianpu: getJianpuLabel(getMidi(key)),
        keyCap: KEY_DISPLAY[key],
      })),
    [getMidi],
  )

  const totalBeats = useMemo(() => {
    if (notes.length === 0) return 0
    return Math.ceil(Math.max(...notes.map(n => n.startBeat + n.durationBeats)))
  }, [notes])

  // ------- 键盘事件 -------
  useEffect(() => {
    const isEditableTarget = (el: EventTarget | null): boolean => {
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

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return
      if (isEditableTarget(e.target)) return
      const k = e.key.toLowerCase() as HarmonicaKey
      if (!SIM_KEYS.includes(k)) return
      e.preventDefault()
      setActiveKey(k)
    }

    const onKeyUp = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase() as HarmonicaKey
      if (!SIM_KEYS.includes(k)) return
      setActiveKey(prev => (prev === k ? null : prev))
    }

    const onBlur = () => {
      setActiveKey(null)
      setMouseButtonStack([])
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
    }
  }, [])

  // ------- 音频同步（单音） -------
  useEffect(() => {
    if (currentIdRef.current) {
      stopKeyNote(currentIdRef.current)
      currentIdRef.current = null
    }
    if (activeKey) {
      const id = `sim-${activeKey}`
      currentIdRef.current = id
      startKeyNote(id, getMidi(activeKey))
    }
  }, [activeKey, getMidi])

  useEffect(() => {
    return () => {
      if (currentIdRef.current) {
        stopKeyNote(currentIdRef.current)
        currentIdRef.current = null
      }
    }
  }, [])

  // ------- 阻止中键 autoscroll（会吞掉其他鼠标事件） -------
  useEffect(() => {
    const preventAutoScroll = (e: MouseEvent) => {
      if (e.button === 1) e.preventDefault()
    }
    window.addEventListener('mousedown', preventAutoScroll, { capture: true })
    return () =>
      window.removeEventListener('mousedown', preventAutoScroll, { capture: true })
  }, [])

  // ------- 全局 mouseup -------
  useEffect(() => {
    const onMouseUp = (e: MouseEvent) => {
      setMouseButtonStack(prev => {
        if (!prev.includes(e.button)) return prev
        return prev.filter(b => b !== e.button)
      })
    }
    window.addEventListener('mouseup', onMouseUp)
    return () => window.removeEventListener('mouseup', onMouseUp)
  }, [])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 0 || e.button === 1 || e.button === 2) {
      if (e.button === 1) e.preventDefault()
      setMouseButtonStack(prev => [...prev.filter(b => b !== e.button), e.button])
    }
  }, [])

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
  }, [])

  return (
    <Box
      sx={{
        position: 'relative',
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        bgcolor: 'background.default',
        userSelect: 'none',
      }}
    >
      {/*
        谱子区域：
        - 外层只负责展开/收起动画（裁剪）
        - 内层是固定高度的「舞台」，圆角矩形完全贴合这个舞台高度
        - 圆角矩形自身 overflow: auto —— 只有乐谱在矩形内滚动，矩形本身不移动
        - 矩形采用 maxHeight: 100% —— 内容少时自动收缩，内容多时封顶并内部滚动
      */}
      <Box
        sx={{
          flexShrink: 0,
          overflow: 'hidden',
          maxHeight: showScore ? SCORE_PANEL_HEIGHT : 0,
          opacity: showScore ? 1 : 0,
          transform: showScore ? 'translateY(0)' : 'translateY(-16px)',
          transition: showScore
            ? 'max-height 0.45s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.28s ease 0.08s, transform 0.45s cubic-bezier(0.4, 0, 0.2, 1)'
            : 'max-height 0.4s cubic-bezier(0.4, 0, 0.2, 1) 0.05s, opacity 0.18s ease, transform 0.32s cubic-bezier(0.4, 0, 0.2, 1)',
          pointerEvents: showScore ? 'auto' : 'none',
        }}
      >
        <Box
          sx={{
            height: SCORE_PANEL_HEIGHT,
            boxSizing: 'border-box',
            p: 2,
            pt: 1,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'flex-start',
          }}
        >
          {totalBeats > 0 ? (
            <Box
              sx={{
                maxHeight: '100%',
                maxWidth: '100%',
                overflow: 'auto',
                bgcolor: 'background.paper',
                borderRadius: 1,
                boxShadow: 1,
              }}
            >
              <Box
                sx={{
                  p: 1,
                  display: 'flex',
                  justifyContent: 'center',
                  lineHeight: 0,
                }}
              >
                <KeyboardScore
                  notes={notes}
                  beatsPerBar={track.beatsPerBar}
                  totalBeats={totalBeats}
                  title=""
                  showLegend={false}
                  showBarNumbers={false}
                  bottomPadding={4}
                />
              </Box>
            </Box>
          ) : null}
        </Box>
      </Box>

      {/* 主区域 */}
      <Box
        onMouseDown={handleMouseDown}
        onContextMenu={handleContextMenu}
        sx={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'default',
          minHeight: 0,
          gap: 3,
        }}
      >
        <Stack direction="row" spacing={1.5} sx={{ flexWrap: 'nowrap' }}>
          {keyLabels.map(({ key, jianpu, keyCap }) => {
            const isPressed = activeKey === key
            return (
              <Paper
                key={key}
                elevation={0}
                sx={{
                  width: 76,
                  height: 158,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  py: 2,
                  px: 1,
                  cursor: 'default',
                  bgcolor: 'background.paper',
                  borderRadius: 2,
                  boxShadow: isPressed
                    ? '0 0 0 4px rgba(124,58,237,0.45), 0 6px 16px rgba(0,0,0,0.18)'
                    : '0 2px 4px rgba(0,0,0,0.08)',
                  transform: isPressed ? 'translateY(2px)' : 'none',
                  transition: 'box-shadow 0.1s ease, transform 0.08s ease',
                  '&:hover': { cursor: 'default' },
                }}
              >
                <Box
                  sx={{
                    fontSize: 30,
                    fontWeight: 700,
                    lineHeight: 1,
                    letterSpacing: '-0.02em',
                    fontFamily: 'Inter, system-ui, sans-serif',
                    color: 'text.primary',
                  }}
                >
                  {jianpu}
                </Box>

                <Box
                  sx={{
                    width: 44,
                    height: 44,
                    borderRadius: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    bgcolor: capFill,
                    color: '#fff',
                    boxShadow: isSharp
                      ? `0 0 0 3px ${sharpBorderColor}`
                      : 'none',
                    transition:
                      'background-color 0.12s ease, color 0.12s ease, box-shadow 0.12s ease',
                  }}
                >
                  <Box
                    sx={{
                      fontSize: 22,
                      fontWeight: 700,
                      lineHeight: 1,
                      fontFamily: 'Inter, system-ui, sans-serif',
                    }}
                  >
                    {keyCap}
                  </Box>
                </Box>
              </Paper>
            )
          })}
        </Stack>

        {/* 鼠标按钮指示器 */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.5,
            p: 0.75,
            borderRadius: 2,
            border: '1px solid',
            borderColor: 'divider',
            bgcolor: 'action.hover',
          }}
        >
          <Box
            sx={{
              width: 26,
              height: 30,
              borderRadius: '8px 2px 2px 8px',
              border: '2px solid',
              borderColor: octaveDir === 'left' ? NOTE_COLORS.low : 'divider',
              bgcolor: octaveDir === 'left' ? NOTE_COLORS.low : 'transparent',
              color: octaveDir === 'left' ? '#fff' : 'text.disabled',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.15s ease',
            }}
          >
            <KeyboardArrowDownIcon sx={{ fontSize: 18 }} />
          </Box>

          <Box
            sx={{
              width: 16,
              height: 30,
              borderRadius: 1,
              border: '2px solid',
              borderColor: isMiddlePressed ? COLOR_MID : 'divider',
              bgcolor: isMiddlePressed ? COLOR_MID : 'transparent',
              color: isMiddlePressed ? '#fff' : 'text.disabled',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.15s ease',
            }}
          >
            <Box
              sx={{
                width: 5,
                height: 5,
                borderRadius: '50%',
                bgcolor: 'currentColor',
              }}
            />
          </Box>

          <Box
            sx={{
              width: 26,
              height: 30,
              borderRadius: '2px 8px 8px 2px',
              border: '2px solid',
              borderColor: octaveDir === 'right' ? NOTE_COLORS.high : 'divider',
              bgcolor: octaveDir === 'right' ? NOTE_COLORS.high : 'transparent',
              color: octaveDir === 'right' ? '#fff' : 'text.disabled',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.15s ease',
            }}
          >
            <KeyboardArrowUpIcon sx={{ fontSize: 18 }} />
          </Box>
        </Box>
      </Box>
    </Box>
  )
}