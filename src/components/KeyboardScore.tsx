import { useMemo } from 'react'
import { useTheme } from '@mui/material'
import type { Note, HarmonicaKey, OctaveShift } from '../types'
import {
  getMidiNote,
  getAllMappingsForMidi,
  KEY_DISPLAY,
} from '../utils/noteMapping'
import { useAppContext } from '../contexts/AppContext'
import { getTranslations } from '../i18n/translations'
import { createProjectFile, encodeProjectForQR } from '../utils/projectFormat'
import { createQRMatrix, qrMatrixToPath } from '../utils/qrCode'

const NOTE_HEIGHT = 40
const MIN_NOTE_WIDTH = 24
const LINE_PADDING = 20

export const EXPORT_FONT_FAMILY =
  "Inter, system-ui, -apple-system, 'Segoe UI', Roboto, Arial, Helvetica, sans-serif"

/** 八度层级配色（暖 → 中性 → 冷，对应 更低 → 默认 → 更高） */
export const NOTE_COLORS = {
  low: '#ea580c',
  default: '#7c3aed',
  high: '#0ea5e9',
} as const

type Mapping = { key: HarmonicaKey; octaveShift: OctaveShift; isSharp: boolean }

function computeSmartMappings(notes: Note[]): Note[] {
  if (notes.length === 0) return []

  const allMappings: Mapping[][] = notes.map(note => {
    const midi = getMidiNote(note.key, note.octaveShift, note.isSharp)
    const mappings = getAllMappingsForMidi(midi)
    if (mappings.length === 0) {
      return [
        { key: note.key, octaveShift: note.octaveShift, isSharp: note.isSharp },
      ]
    }
    return mappings
  })

  interface DPEntry {
    cost: number
    prevIndex: number
    mapping: Mapping
  }

  const dp: DPEntry[][] = []

  dp.push(
    allMappings[0].map(m => {
      let cost = 0
      if (m.octaveShift === 0) cost -= 0.5
      if (!m.isSharp) cost -= 0.5
      return { cost, prevIndex: -1, mapping: m }
    }),
  )

  for (let i = 1; i < notes.length; i++) {
    const prevEntries = dp[i - 1]
    const currEntries: DPEntry[] = allMappings[i].map(currMapping => {
      let bestCost = Infinity
      let bestPrevIndex = -1

      for (let j = 0; j < prevEntries.length; j++) {
        const prev = prevEntries[j]
        const pm = prev.mapping
        const octaveChanged = currMapping.octaveShift !== pm.octaveShift ? 1 : 0
        const sharpChanged = currMapping.isSharp !== pm.isSharp ? 1 : 0
        let transitionCost = octaveChanged + sharpChanged
        if (currMapping.key === pm.key) transitionCost -= 0.1

        const total = prev.cost + transitionCost
        if (total < bestCost) {
          bestCost = total
          bestPrevIndex = j
        }
      }

      return { cost: bestCost, prevIndex: bestPrevIndex, mapping: currMapping }
    })
    dp.push(currEntries)
  }

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
    result[i] = {
      ...notes[i],
      key: entry.mapping.key,
      octaveShift: entry.mapping.octaveShift,
      isSharp: entry.mapping.isSharp,
    }
    currIndex = entry.prevIndex
  }

  return result
}

function estimateTextWidth(text: string, fontSize: number): number {
  let width = 0
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    if (code > 0x2e80) width += fontSize
    else width += fontSize * 0.55
  }
  return width
}

interface KeyboardScoreProps {
  notes: Note[]
  beatsPerBar: number
  totalBeats: number
  bpm?: number
  barsPerLine?: number
  title?: string
  composer?: string
  transcriber?: string
  mode?: 'light' | 'dark'
  showLegend?: boolean
  showBarNumbers?: boolean
  bottomPadding?: number
  /** 是否在标题下方嵌入紧凑编码二维码 */
  includeQR?: boolean
}

export function KeyboardScore({
  notes,
  beatsPerBar,
  totalBeats,
  bpm = 120,
  barsPerLine = 2,
  title = 'harmonica-score',
  composer = '',
  transcriber = '',
  mode,
  showLegend = true,
  showBarNumbers = true,
  bottomPadding = 40,
  includeQR = false,
}: KeyboardScoreProps) {
  const theme = useTheme()
  const { language } = useAppContext()
  const t = getTranslations(language)
  const isDark = mode ? mode === 'dark' : theme.palette.mode === 'dark'

  const c = isDark
    ? {
        bg: '#1e1e1e',
        title: '#e5e5e5',
        credit: '#b0b0b0',
        barNum: '#999999',
        barLine: 'rgba(255,255,255,0.45)',
        beatLine: 'rgba(255,255,255,0.15)',
        restBg: 'rgba(255,255,255,0.08)',
        neutralBg: 'rgba(255,255,255,0.1)',
        neutralText: '#e5e5e5',
        neutralStroke: 'rgba(255,255,255,0.35)',
        noteStrokeDefault: 'rgba(255,255,255,0.3)',
        noteStrokeSharp: '#ffffff',
        qrBorder: 'rgba(255,255,255,0.25)',
      }
    : {
        bg: '#ffffff',
        title: '#333333',
        credit: '#666666',
        barNum: '#666666',
        barLine: 'rgba(0,0,0,0.4)',
        beatLine: 'rgba(0,0,0,0.15)',
        restBg: 'rgba(0,0,0,0.08)',
        neutralBg: '#f8fafc',
        neutralText: '#333333',
        neutralStroke: '#000000',
        noteStrokeDefault: 'rgba(0,0,0,0.3)',
        noteStrokeSharp: '#000000',
        qrBorder: 'rgba(0,0,0,0.15)',
      }

  const sortedNotes = useMemo(
    () => [...notes].sort((a, b) => a.startBeat - b.startBeat),
    [notes],
  )

  const smartMappedNotes = useMemo(
    () => computeSmartMappings(sortedNotes),
    [sortedNotes],
  )

  const blocks = useMemo(() => {
    const result: { start: number; duration: number; note?: Note }[] = []
    let currentBeat = 0
    for (const note of smartMappedNotes) {
      if (note.startBeat > currentBeat) {
        result.push({
          start: currentBeat,
          duration: note.startBeat - currentBeat,
        })
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

  const svgWidth = lineWidth + 40

  // ---------------- 二维码（紧凑编码） ----------------
  const qrMatrix = useMemo(() => {
    if (!includeQR) return null
    const project = createProjectFile(
      { notes, bpm, beatsPerBar },
      { title, composer, transcriber },
    )
    const encoded = encodeProjectForQR(project)
    return createQRMatrix(encoded)
  }, [includeQR, notes, bpm, beatsPerBar, title, composer, transcriber])

  // 二维码显示尺寸：明显放大以提升扫描成功率与信息容量
  const qrDisplaySize = qrMatrix
    ? Math.min(160, Math.max(110, qrMatrix.size * 2.0))
    : 0

  // ---------------- 页眉布局 ----------------
  const hasTitle = title.trim().length > 0
  const hasComposer = composer.trim().length > 0
  const hasTranscriber = transcriber.trim().length > 0
  const hasQR = qrMatrix !== null

  const TITLE_LINE_HEIGHT = 28
  const CREDIT_LINE_HEIGHT = 15
  const LEGEND_LINE_HEIGHT = 22

  let headerHeight = 12
  let titleY = 0
  let composerY = 0
  let transcriberY = 0
  let legendY = 0
  let qrRenderX = 0
  let qrRenderY = 0

  if (
    hasTitle ||
    hasComposer ||
    hasTranscriber ||
    showLegend ||
    hasQR
  ) {
    let cursorY = 10

    if (hasTitle) {
      titleY = cursorY + 18
      cursorY += TITLE_LINE_HEIGHT
    }

    if (hasQR) {
      qrRenderX = 10
      qrRenderY = cursorY + 4
      const qrCenterY = qrRenderY + qrDisplaySize / 2

      const creditRows =
        (hasComposer ? 1 : 0) + (hasTranscriber ? 1 : 0)
      const creditsHeight = creditRows * CREDIT_LINE_HEIGHT
      let creditCursorY = qrCenterY - creditsHeight / 2

      if (hasComposer) {
        composerY = creditCursorY + 11
        creditCursorY += CREDIT_LINE_HEIGHT
      }
      if (hasTranscriber) {
        transcriberY = creditCursorY + 11
        creditCursorY += CREDIT_LINE_HEIGHT
      }

      cursorY = qrRenderY + qrDisplaySize + 6
    } else if (hasComposer || hasTranscriber) {
      if (hasComposer) {
        composerY = cursorY + 11
        cursorY += CREDIT_LINE_HEIGHT + 1
      }
      if (hasTranscriber) {
        transcriberY = cursorY + 11
        cursorY += CREDIT_LINE_HEIGHT + 1
      }
    }

    if (showLegend) {
      legendY = cursorY + 14
      cursorY += LEGEND_LINE_HEIGHT
    }

    headerHeight = cursorY + 6
  }

  const svgHeight =
    headerHeight + lines.length * (NOTE_HEIGHT + 12) + bottomPadding

  const getNoteColor = (note: Note): string => {
    if (note.octaveShift === -1) return NOTE_COLORS.low
    if (note.octaveShift === 1) return NOTE_COLORS.high
    return NOTE_COLORS.default
  }

  // ---------------- 图例 ----------------
  const legendFontSize = 10
  const swatchSize = 10
  const swatchTextGap = 5
  const itemGap = 14

  const legendItems = [
    {
      label: t.keyboardPreview.leftClick,
      color: NOTE_COLORS.low,
      neutral: false,
    },
    {
      label: t.keyboardPreview.default,
      color: NOTE_COLORS.default,
      neutral: false,
    },
    {
      label: t.keyboardPreview.rightClick,
      color: NOTE_COLORS.high,
      neutral: false,
    },
    {
      label: t.keyboardPreview.middleClick,
      color: c.neutralBg,
      neutral: true,
    },
  ]

  let legendCursorX = 10
  const legendElements: React.ReactNode[] = legendItems.map((item, idx) => {
    const textW = estimateTextWidth(item.label, legendFontSize)
    const itemW = swatchSize + swatchTextGap + textW
    const x = legendCursorX
    legendCursorX += itemW + itemGap
    return (
      <g key={`legend-${idx}`}>
        <rect
          x={x}
          y={-swatchSize + 1}
          width={swatchSize}
          height={swatchSize}
          rx={2}
          fill={item.color}
          stroke={item.neutral ? c.neutralStroke : 'none'}
          strokeWidth={item.neutral ? 1.2 : 0}
        />
        <text
          x={x + swatchSize + swatchTextGap}
          y={0}
          fontSize={legendFontSize}
          fill={c.title}
        >
          {item.label}
        </text>
      </g>
    )
  })

  return (
    <svg
      width={svgWidth}
      height={svgHeight}
      style={{ display: 'block', background: c.bg }}
      fontFamily={EXPORT_FONT_FAMILY}
    >
      {hasTitle && (
        <text x={10} y={titleY} fontSize="18" fontWeight="bold" fill={c.title}>
          {title}
        </text>
      )}

      {qrMatrix && (
        <g>
          <rect
            x={qrRenderX - 3}
            y={qrRenderY - 3}
            width={qrDisplaySize + 6}
            height={qrDisplaySize + 6}
            fill="#ffffff"
            stroke={c.qrBorder}
            strokeWidth={1}
            rx={4}
          />
          <path
            d={qrMatrixToPath(qrMatrix, qrRenderX, qrRenderY, qrDisplaySize)}
            fill="#000000"
          />
        </g>
      )}

      {hasComposer && (
        <text
          x={svgWidth - 10}
          y={composerY}
          textAnchor="end"
          fontSize="11"
          fill={c.credit}
        >
          {`${t.keyboardPreview.composer}: ${composer}`}
        </text>
      )}

      {hasTranscriber && (
        <text
          x={svgWidth - 10}
          y={transcriberY}
          textAnchor="end"
          fontSize="11"
          fill={c.credit}
        >
          {`${t.keyboardPreview.transcriber}: ${transcriber}`}
        </text>
      )}

      {showLegend && (
        <g transform={`translate(0, ${legendY})`}>{legendElements}</g>
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
          if (
            isBar &&
            showBarNumbers &&
            globalBeat / beatsPerBar < totalBars
          ) {
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
                const keyLabel =
                  KEY_DISPLAY[note.key] + (note.isSharp ? '#' : '')
                return (
                  <g key={`block-${lineIdx}-${blockIdx}`}>
                    <rect
                      x={x}
                      y={lineY}
                      width={width}
                      height={NOTE_HEIGHT}
                      fill={fill}
                      stroke={
                        note.isSharp ? c.noteStrokeSharp : c.noteStrokeDefault
                      }
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