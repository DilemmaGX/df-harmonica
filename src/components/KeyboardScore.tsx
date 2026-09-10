import { useMemo } from 'react'
import { useTheme } from '@mui/material'
import type { Note, HarmonicaKey, OctaveShift } from '../types'
import { getMidiNote, getAllMappingsForMidi, KEY_DISPLAY } from '../utils/noteMapping'
import { useAppContext } from '../contexts/AppContext'
import { getTranslations } from '../i18n/translations'

const NOTE_HEIGHT = 40
const MIN_NOTE_WIDTH = 24
const HEADER_HEIGHT = 60
const LINE_PADDING = 20

export const EXPORT_FONT_FAMILY =
  "Inter, system-ui, -apple-system, 'Segoe UI', Roboto, Arial, Helvetica, sans-serif"

/** 八度层级配色（暖 → 中性 → 冷，对应 更低 → 默认 → 更高） */
export const NOTE_COLORS = {
  low: '#ea580c', // 橙色：低八度
  default: '#7c3aed', // 紫色：默认
  high: '#0ea5e9', // 天蓝：高八度
} as const

type Mapping = { key: HarmonicaKey; octaveShift: OctaveShift; isSharp: boolean }

/**
 * 全局最优的智能映射。
 * 目标：最小化鼠标状态（八度方向 + 半音开关）的切换次数。
 * 使用动态规划在整个音符序列上寻找总切换代价最小的映射方案。
 */
function computeSmartMappings(notes: Note[]): Note[] {
  if (notes.length === 0) return []

  // 为每个音符计算所有可能的映射
  const allMappings: Mapping[][] = notes.map(note => {
    const midi = getMidiNote(note.key, note.octaveShift, note.isSharp)
    const mappings = getAllMappingsForMidi(midi)
    if (mappings.length === 0) {
      // 回退到原始映射
      return [{ key: note.key, octaveShift: note.octaveShift, isSharp: note.isSharp }]
    }
    return mappings
  })

  interface DPEntry {
    cost: number
    prevIndex: number
    mapping: Mapping
  }

  const dp: DPEntry[][] = []

  // 第一个音符：基础偏好（默认八度、自然音）作为轻微初始代价
  const firstMappings = allMappings[0]
  const firstEntries: DPEntry[] = firstMappings.map(m => {
    let cost = 0
    if (m.octaveShift === 0) cost -= 0.5
    if (!m.isSharp) cost -= 0.5
    return { cost, prevIndex: -1, mapping: m }
  })
  dp.push(firstEntries)

  // 后续音符：转移代价 = 鼠标状态变化 + 按键连续性奖励
  for (let i = 1; i < notes.length; i++) {
    const prevEntries = dp[i - 1]
    const currMappings = allMappings[i]
    const currEntries: DPEntry[] = currMappings.map(currMapping => {
      let bestCost = Infinity
      let bestPrevIndex = -1

      for (let j = 0; j < prevEntries.length; j++) {
        const prev = prevEntries[j]
        const prevMapping = prev.mapping

        // 鼠标状态变化：八度方向变化 + 半音状态变化
        const octaveChanged = currMapping.octaveShift !== prevMapping.octaveShift ? 1 : 0
        const sharpChanged = currMapping.isSharp !== prevMapping.isSharp ? 1 : 0
        let transitionCost = octaveChanged + sharpChanged

        // 按键连续性奖励（小权重，用于打破平局）
        if (currMapping.key === prevMapping.key) {
          transitionCost -= 0.1
        }

        const totalCost = prev.cost + transitionCost
        if (totalCost < bestCost) {
          bestCost = totalCost
          bestPrevIndex = j
        }
      }

      return { cost: bestCost, prevIndex: bestPrevIndex, mapping: currMapping }
    })
    dp.push(currEntries)
  }

  // 回溯找到最优路径
  const lastEntries = dp[dp.length - 1]
  let bestLastIndex = 0
  let bestLastCost = Infinity
  for (let i = 0; i < lastEntries.length; i++) {
    if (lastEntries[i].cost < bestLastCost) {
      bestLastCost = lastEntries[i].cost
      bestLastIndex = i
    }
  }

  const result: Note[] = new Array(notes.length)
  let currIndex = bestLastIndex
  for (let i = notes.length - 1; i >= 0; i--) {
    const entry = dp[i][currIndex]
    const originalNote = notes[i]
    result[i] = {
      ...originalNote,
      key: entry.mapping.key,
      octaveShift: entry.mapping.octaveShift,
      isSharp: entry.mapping.isSharp,
    }
    currIndex = entry.prevIndex
  }

  return result
}

interface KeyboardScoreProps {
  notes: Note[]
  beatsPerBar: number
  totalBeats: number
  barsPerLine?: number
  title?: string
  /** 明暗模式；不传则跟随全局主题（主题默认跟随系统） */
  mode?: 'light' | 'dark'
  showLegend?: boolean
  showBarNumbers?: boolean
}

export function KeyboardScore({
  notes,
  beatsPerBar,
  totalBeats,
  barsPerLine = 2,
  title = 'harmonica-score',
  mode,
  showLegend = true,
  showBarNumbers = true,
}: KeyboardScoreProps) {
  const theme = useTheme()
  const { language } = useAppContext()
  const t = getTranslations(language)
  const isDark = mode ? mode === 'dark' : theme.palette.mode === 'dark'

  const c = isDark
    ? {
        bg: '#1e1e1e',
        title: '#e5e5e5',
        barNum: '#999999',
        barLine: 'rgba(255,255,255,0.45)',
        beatLine: 'rgba(255,255,255,0.15)',
        restBg: 'rgba(255,255,255,0.08)',
        neutralBg: 'rgba(255,255,255,0.1)',
        neutralText: '#e5e5e5',
        neutralStroke: 'rgba(255,255,255,0.35)',
        noteStrokeDefault: 'rgba(255,255,255,0.3)',
        noteStrokeSharp: '#ffffff',
      }
    : {
        bg: '#ffffff',
        title: '#333333',
        barNum: '#666666',
        barLine: 'rgba(0,0,0,0.4)',
        beatLine: 'rgba(0,0,0,0.15)',
        restBg: 'rgba(0,0,0,0.08)',
        neutralBg: '#f8fafc',
        neutralText: '#333333',
        neutralStroke: '#000000',
        noteStrokeDefault: 'rgba(0,0,0,0.3)',
        noteStrokeSharp: '#000000',
      }

  const sortedNotes = useMemo(
    () => [...notes].sort((a, b) => a.startBeat - b.startBeat),
    [notes],
  )

  // 使用全局最优的动态规划进行智能映射
  const smartMappedNotes = useMemo(() => {
    return computeSmartMappings(sortedNotes)
  }, [sortedNotes])

  const blocks = useMemo(() => {
    const result: { start: number; duration: number; note?: Note }[] = []
    let currentBeat = 0
    for (const note of smartMappedNotes) {
      if (note.startBeat > currentBeat) {
        result.push({ start: currentBeat, duration: note.startBeat - currentBeat })
      }
      result.push({ start: note.startBeat, duration: note.durationBeats, note })
      currentBeat = note.startBeat + note.durationBeats
    }
    return result
  }, [smartMappedNotes])

  const pixelsPerBeat = useMemo(() => Math.max(80, MIN_NOTE_WIDTH * 4), [])
  const beatsPerLine = barsPerLine * beatsPerBar
  const lineContentWidth = beatsPerLine * pixelsPerBeat
  const lineWidth = lineContentWidth + LINE_PADDING * 2
  const totalBars = Math.max(Math.ceil(totalBeats / beatsPerBar), 1)

  const lines = useMemo(() => {
    const result: {
      startBar: number
      blocks: { start: number; duration: number; note?: Note }[]
    }[] = []
    for (let barStart = 0; barStart < totalBars; barStart += barsPerLine) {
      const lineStartBeat = barStart * beatsPerBar
      const lineEndBeat = Math.min(
        (barStart + barsPerLine) * beatsPerBar,
        totalBars * beatsPerBar,
      )
      const lineBlocks = blocks.filter(
        b => b.start < lineEndBeat && b.start + b.duration > lineStartBeat,
      )
      result.push({ startBar: barStart, blocks: lineBlocks })
    }
    return result
  }, [blocks, barsPerLine, beatsPerBar, totalBars])

  const headerHeight = title || showLegend ? HEADER_HEIGHT : 12
  const svgWidth = lineWidth + 40
  const svgHeight = headerHeight + lines.length * (NOTE_HEIGHT + 12) + 40

  const getNoteColor = (note: Note): string => {
    if (note.octaveShift === -1) return NOTE_COLORS.low
    if (note.octaveShift === 1) return NOTE_COLORS.high
    return NOTE_COLORS.default
  }

  const legendItems = [
    { label: t.keyboardPreview.leftClick, color: NOTE_COLORS.low },
    { label: t.keyboardPreview.default, color: NOTE_COLORS.default },
    { label: t.keyboardPreview.rightClick, color: NOTE_COLORS.high },
  ]

  return (
    <svg
      width={svgWidth}
      height={svgHeight}
      style={{ display: 'block', background: c.bg }}
      fontFamily={EXPORT_FONT_FAMILY}
    >
      {title && (
        <text x={10} y={20} fontSize="16" fontWeight="bold" fill={c.title}>
          {title}
        </text>
      )}

      {showLegend && (
        <g transform="translate(10, 30)">
          {legendItems.map((item, idx) => (
            <g key={item.label}>
              <rect x={idx * 85} y={0} width={80} height={16} fill={item.color} rx={3} />
              <text
                x={idx * 85 + 40}
                y={12}
                textAnchor="middle"
                fontSize="9"
                fill="white"
                fontWeight="500"
              >
                {item.label}
              </text>
            </g>
          ))}
          <rect
            x={3 * 85}
            y={0}
            width={80}
            height={16}
            fill={c.neutralBg}
            stroke={c.neutralStroke}
            strokeWidth={2}
            rx={3}
          />
          <text
            x={3 * 85 + 40}
            y={12}
            textAnchor="middle"
            fontSize="9"
            fill={c.neutralText}
            fontWeight="500"
          >
            {t.keyboardPreview.middleClick}
          </text>
        </g>
      )}

      {lines.map((line, lineIdx) => {
        const lineY = headerHeight + lineIdx * (NOTE_HEIGHT + 12)
        const lineStartBeat = line.startBar * beatsPerBar

        const beatLines: React.ReactNode[] = []
        for (let b = 0; b <= beatsPerLine; b++) {
          const globalBeat = lineStartBeat + b
          if (globalBeat > totalBars * beatsPerBar) break
          const x = LINE_PADDING + b * pixelsPerBeat
          const isBar = b % beatsPerBar === 0
          beatLines.push(
            <line
              key={`beat-${lineIdx}-${b}`}
              x1={x}
              y1={lineY}
              x2={x}
              y2={lineY + NOTE_HEIGHT}
              stroke={isBar ? c.barLine : c.beatLine}
              strokeWidth={isBar ? 1.5 : 0.5}
            />,
          )
          if (isBar && showBarNumbers && globalBeat / beatsPerBar < totalBars) {
            const barNumber = globalBeat / beatsPerBar + 1
            beatLines.push(
              <text
                key={`bar-${lineIdx}-${b}`}
                x={x + 2}
                y={lineY - 2}
                fontSize="9"
                fill={c.barNum}
              >
                {barNumber}
              </text>,
            )
          }
        }

        const lineEndBeat = Math.min(
          (line.startBar + barsPerLine) * beatsPerBar,
          totalBars * beatsPerBar,
        )

        return (
          <g key={`line-${lineIdx}`}>
            {beatLines}
            {line.blocks.map((block, blockIdx) => {
              const relativeStart = Math.max(0, block.start - lineStartBeat)
              const relativeEnd = Math.min(
                lineEndBeat - lineStartBeat,
                block.start + block.duration - lineStartBeat,
              )
              const width = Math.max(
                0,
                (relativeEnd - relativeStart) * pixelsPerBeat - 2,
              )
              if (width <= 0) return null
              const x = LINE_PADDING + relativeStart * pixelsPerBeat
              if (block.note) {
                const note = block.note
                const fill = getNoteColor(note)
                const keyLabel = KEY_DISPLAY[note.key] + (note.isSharp ? '#' : '')
                return (
                  <g key={`block-${lineIdx}-${blockIdx}`}>
                    <rect
                      x={x}
                      y={lineY}
                      width={width}
                      height={NOTE_HEIGHT}
                      fill={fill}
                      stroke={note.isSharp ? c.noteStrokeSharp : c.noteStrokeDefault}
                      strokeWidth={note.isSharp ? 2.5 : 1}
                      rx={3}
                      opacity={0.92}
                    >
                      <title>{keyLabel}</title>
                    </rect>
                    {width > 20 && (
                      <text
                        x={x + width / 2}
                        y={lineY + NOTE_HEIGHT / 2 + 5}
                        textAnchor="middle"
                        fontSize="12"
                        fontWeight="bold"
                        fill="white"
                      >
                        {keyLabel}
                      </text>
                    )}
                  </g>
                )
              } else {
                return (
                  <rect
                    key={`rest-${lineIdx}-${blockIdx}`}
                    x={x}
                    y={lineY}
                    width={width}
                    height={NOTE_HEIGHT}
                    fill={c.restBg}
                    rx={3}
                  />
                )
              }
            })}
          </g>
        )
      })}
    </svg>
  )
}