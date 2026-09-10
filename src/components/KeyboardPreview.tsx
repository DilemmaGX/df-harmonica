import { useEffect, useRef, useState } from 'react'
import {
  Box,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  useTheme,
} from '@mui/material'
import DownloadIcon from '@mui/icons-material/Download'
import LightModeIcon from '@mui/icons-material/LightMode'
import DarkModeIcon from '@mui/icons-material/DarkMode'
import type { Note } from '../types'
import { useAppContext } from '../contexts/AppContext'
import { getTranslations } from '../i18n/translations'
import { KeyboardScore, EXPORT_FONT_FAMILY } from './KeyboardScore'

interface KeyboardPreviewProps {
  notes: Note[]
  beatsPerBar: number
  totalBeats: number
  open: boolean
  onClose: () => void
}

export function KeyboardPreviewDialog({
  notes,
  beatsPerBar,
  totalBeats,
  open,
  onClose,
}: KeyboardPreviewProps) {
  const { language } = useAppContext()
  const t = getTranslations(language)
  const theme = useTheme()
  const [exportName, setExportName] = useState('harmonica-score')
  const [barsPerLine, setBarsPerLine] = useState(2)
  const [scoreMode, setScoreMode] = useState<'light' | 'dark'>(
    () => theme.palette.mode as 'light' | 'dark',
  )
  const previewRef = useRef<HTMLDivElement>(null)

  // 每次打开时，默认跟随当前主题
  useEffect(() => {
    if (open) {
      setScoreMode(theme.palette.mode as 'light' | 'dark')
    }
  }, [open, theme.palette.mode])

  const doExport = (format: 'png' | 'svg') => {
    const el = previewRef.current
    if (!el) return
    const svg = el.querySelector('svg')
    if (!svg) return
    const bgColor = scoreMode === 'dark' ? '#1e1e1e' : '#ffffff'
    const serializer = new XMLSerializer()
    const svgClone = svg.cloneNode(true) as SVGSVGElement
    svgClone.setAttribute('font-family', EXPORT_FONT_FAMILY)
    const bgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
    bgRect.setAttribute('width', '100%')
    bgRect.setAttribute('height', '100%')
    bgRect.setAttribute('fill', bgColor)
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
        ctx.fillStyle = bgColor
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
              <MenuItem key={n} value={n}>
                {n}
              </MenuItem>
            ))}
          </TextField>

          {/* 明暗模式切换 */}
          <ToggleButtonGroup
            size="small"
            exclusive
            value={scoreMode}
            onChange={(_, v: 'light' | 'dark' | null) => {
              if (v) setScoreMode(v)
            }}
          >
            <ToggleButton value="light" sx={{ px: 1, py: 0.4 }}>
              <LightModeIcon fontSize="small" />
            </ToggleButton>
            <ToggleButton value="dark" sx={{ px: 1, py: 0.4 }}>
              <DarkModeIcon fontSize="small" />
            </ToggleButton>
          </ToggleButtonGroup>

          <Button
            variant="contained"
            startIcon={<DownloadIcon />}
            onClick={() => doExport('png')}
            size="small"
          >
            PNG
          </Button>
          <Button variant="outlined" onClick={() => doExport('svg')} size="small">
            SVG
          </Button>
        </Stack>

        <Box
          ref={previewRef}
          sx={{
            overflow: 'auto',
            bgcolor: scoreMode === 'dark' ? '#1e1e1e' : '#ffffff',
            border: '1px solid',
            borderColor: 'divider',
            p: 1,
          }}
        >
          <KeyboardScore
            notes={notes}
            beatsPerBar={beatsPerBar}
            totalBeats={totalBeats}
            barsPerLine={barsPerLine}
            title={exportName}
            mode={scoreMode}
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t.dialogs.close}</Button>
      </DialogActions>
    </Dialog>
  )
}