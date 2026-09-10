import { useMemo, useRef, useState } from 'react'
import { Box, Button, Dialog, DialogTitle, DialogContent, DialogActions, TextField, MenuItem, Stack } from '@mui/material'
import DownloadIcon from '@mui/icons-material/Download'
import type { Note } from '../types'
import { getMidiNote, getSmartMapping, KEY_DISPLAY } from '../utils/noteMapping'
import { useAppContext } from '../contexts/AppContext'
import { getTranslations } from '../i18n/translations'

const NOTE_HEIGHT = 40
const MIN_NOTE_WIDTH = 24
const HEADER_HEIGHT = 60
const LINE_PADDING = 20

// 导出时应与界面预览一致的字体栈；末尾以 sans-serif 兜底，避免渲染成衬线体
const EXPORT_FONT_FAMILY =
  "Inter, system-ui, -apple-system, 'Segoe UI', Roboto, Arial, Helvetica, sans-serif"

interface KeyboardPreviewProps {
  notes: Note[]
  beatsPerBar: number
  totalBeats: number
  open: boolean
  onClose: () => void
}

export function KeyboardPreviewDialog({ notes, beatsPerBar, totalBeats, open, onClose }: KeyboardPreviewProps) {
  const { language } = useAppContext()
  const t = getTranslations(language)
  const [exportName, setExportName] = useState('harmonica-score')
  const [barsPerLine, setBarsPerLine] = useState(2)
  const previewRef = useRef<HTMLDivElement>(null)

  const sortedNotes = useMemo(() => [...notes].sort((a, b) => a.startBeat - b.startBeat), [notes])

  const smartMappedNotes = useMemo(() => {
    let previousKey: string | null = null
    let previousOctaveShift: number | null = null
    return sortedNotes.map(note => {
      const midi = getMidiNote(note.key, note.octaveShift, note.isSharp)
      const smart = getSmartMapping(midi, { previousKey: previousKey as any, previousOctaveShift: previousOctaveShift as any })
      if (smart) {
        previousKey = smart.key
        previousOctaveShift = smart.octaveShift
        return { ...note, key: smart.key, octaveShift: smart.octaveShift, isSharp: smart.isSharp }
      }
      return note
    })
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

  // 确保 1/4 拍至少有 MIN_NOTE_WIDTH 像素可读
  const pixelsPerBeat = useMemo(() => Math.max(80, MIN_NOTE_WIDTH * 4), [])
  const beatsPerLine = barsPerLine * beatsPerBar
  const lineContentWidth = beatsPerLine * pixelsPerBeat
  const lineWidth = lineContentWidth + LINE_PADDING * 2
  const totalBars = Math.max(Math.ceil(totalBeats / beatsPerBar), 1)

  // 按小节分组，每行 barsPerLine 个小节
  const lines = useMemo(() => {
    const result: { startBar: number; blocks: { start: number; duration: number; note?: Note }[] }[] = []
    for (let barStart = 0; barStart < totalBars; barStart += barsPerLine) {
      const lineStartBeat = barStart * beatsPerBar
      const lineEndBeat = Math.min((barStart + barsPerLine) * beatsPerBar, totalBars * beatsPerBar)
      const lineBlocks = blocks.filter(b => b.start < lineEndBeat && b.start + b.duration > lineStartBeat)
      result.push({ startBar: barStart, blocks: lineBlocks })
    }
    return result
  }, [blocks, barsPerLine, beatsPerBar, totalBars])

  const svgWidth = lineWidth + 40
  const svgHeight = HEADER_HEIGHT + lines.length * (NOTE_HEIGHT + 12) + 40

  const getNoteColor = (note: Note): string => {
    if (note.octaveShift === -1) return '#dc2626'
    if (note.octaveShift === 1) return '#16a34a'
    return '#2563eb'
  }

  const doExport = (format: 'png' | 'svg') => {
    const el = previewRef.current
    if (!el) return
    const svg = el.querySelector('svg')
    if (!svg) return
    const serializer = new XMLSerializer()
    const svgClone = svg.cloneNode(true) as SVGSVGElement
    // 显式再设一次 font-family，确保序列化后仍保留无衬线字体
    svgClone.setAttribute('font-family', EXPORT_FONT_FAMILY)
    const bgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
    bgRect.setAttribute('width', '100%')
    bgRect.setAttribute('height', '100%')
    bgRect.setAttribute('fill', '#ffffff')
    svgClone.insertBefore(bgRect, svgClone.firstChild)
    const svgString = serializer.serializeToString(svgClone)
    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)

    if (format === 'svg') {
      const a = document.createElement('a')
      a.href = url
      a.download = `${exportName}.svg`
      a.click()
      URL.revokeObjectURL(url)
    } else {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = svg.clientWidth * 2
        canvas.height = svg.clientHeight * 2
        const ctx = canvas.getContext('2d')
        if (!ctx) return
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        ctx.scale(2, 2)
        ctx.drawImage(img, 0, 0)
        URL.revokeObjectURL(url)
        const a = document.createElement('a')
        a.href = canvas.toDataURL('image/png')
        a.download = `${exportName}.png`
        a.click()
      }
      img.src = url
    }
  }

  const legendItems = [
    { label: t.keyboardPreview.leftClick, color: '#dc2626' },
    { label: t.keyboardPreview.default, color: '#2563eb' },
    { label: t.keyboardPreview.rightClick, color: '#16a34a' },
  ]

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle>{t.keyboardPreview.title}</DialogTitle>
      <DialogContent dividers>
        <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 2, flexWrap: 'wrap' }}>
          <TextField
            size="small"
            label={t.dialogs.download}
            value={exportName}
            onChange={(e) => setExportName(e.target.value)}
            sx={{ width: 200 }}
          />
          <TextField
            select
            size="small"
            label={t.keyboardPreview.barsPerLine}
            value={barsPerLine}
            onChange={(e) => setBarsPerLine(Number(e.target.value))}
            sx={{ width: 120 }}
          >
            {[1, 2, 3, 4, 6, 8].map(n => (
              <MenuItem key={n} value={n}>{n}</MenuItem>
            ))}
          </TextField>
          <Button variant="contained" startIcon={<DownloadIcon />} onClick={() => doExport('png')} size="small">
            PNG
          </Button>
          <Button variant="outlined" onClick={() => doExport('svg')} size="small">
            SVG
          </Button>
        </Stack>

        <Box ref={previewRef} sx={{ overflow: 'auto', bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', p: 1 }}>
          <svg
            width={svgWidth}
            height={svgHeight}
            style={{ display: 'block', background: '#fff' }}
            fontFamily={EXPORT_FONT_FAMILY}
          >
            {/* 标题 */}
            <text x={10} y={20} fontSize="16" fontWeight="bold" fill="#333">{exportName}</text>
            {/* 图例 */}
            <g transform="translate(10, 30)">
              {legendItems.map((item, idx) => (
                <g key={item.label}>
                  <rect x={idx * 85} y={0} width={80} height={16} fill={item.color} rx={3} />
                  <text x={idx * 85 + 40} y={12} textAnchor="middle" fontSize="9" fill="white" fontWeight="500">{item.label}</text>
                </g>
              ))}
              <rect x={3 * 85} y={0} width={80} height={16} fill="#f8fafc" stroke="#000" strokeWidth={2} rx={3} />
              <text x={3 * 85 + 40} y={12} textAnchor="middle" fontSize="9" fill="#333" fontWeight="500">{t.keyboardPreview.middleClick}</text>
            </g>

            {/* 各行 */}
            {lines.map((line, lineIdx) => {
              const lineY = HEADER_HEIGHT + lineIdx * (NOTE_HEIGHT + 12)
              const lineStartBeat = line.startBar * beatsPerBar

              // 节拍线：从本行第一个小节的起点开始，全局连续编号
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
                    stroke={isBar ? 'rgba(0,0,0,0.4)' : 'rgba(0,0,0,0.15)'}
                    strokeWidth={isBar ? 1.5 : 0.5}
                  />,
                )
                if (isBar && globalBeat / beatsPerBar < totalBars) {
                  const barNumber = globalBeat / beatsPerBar + 1
                  beatLines.push(
                    <text key={`bar-${lineIdx}-${b}`} x={x + 2} y={lineY - 2} fontSize="9" fill="#666">
                      {barNumber}
                    </text>,
                  )
                }
              }

              const lineEndBeat = Math.min((line.startBar + barsPerLine) * beatsPerBar, totalBars * beatsPerBar)

              return (
                <g key={`line-${lineIdx}`}>
                  {beatLines}
                  {line.blocks.map((block, blockIdx) => {
                    // 块在本行内的相对位置
                    const relativeStart = Math.max(0, block.start - lineStartBeat)
                    const relativeEnd = Math.min(lineEndBeat - lineStartBeat, block.start + block.duration - lineStartBeat)
                    const width = Math.max(0, (relativeEnd - relativeStart) * pixelsPerBeat - 2)
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
                            stroke={note.isSharp ? '#000000' : 'rgba(0,0,0,0.3)'}
                            strokeWidth={note.isSharp ? 2.5 : 1}
                            rx={3}
                            opacity={0.9}
                          >
                            <title>{keyLabel}</title>
                          </rect>
                          {width > 20 && (
                            <text x={x + width / 2} y={lineY + NOTE_HEIGHT / 2 + 5} textAnchor="middle" fontSize="12" fontWeight="bold" fill="white">{keyLabel}</text>
                          )}
                        </g>
                      )
                    } else {
                      return <rect key={`rest-${lineIdx}-${blockIdx}`} x={x} y={lineY} width={width} height={NOTE_HEIGHT} fill="rgba(0,0,0,0.08)" rx={3} />
                    }
                  })}
                </g>
              )
            })}
          </svg>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t.dialogs.close}</Button>
      </DialogActions>
    </Dialog>
  )
}