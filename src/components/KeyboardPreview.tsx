import { useRef, useState } from 'react'
import {
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControlLabel,
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
import { useAppContext } from '../contexts/useAppContext'
import { getTranslations } from '../i18n/translations'
import { KeyboardScore } from './KeyboardScore'
import { EXPORT_FONT_FAMILY } from '../constants/score'
import { saveFile } from '../utils/saveFile'

interface KeyboardPreviewProps {
  notes: Note[]
  beatsPerBar: number
  totalBeats: number
  bpm: number
  open: boolean
  onClose: () => void
}

export function KeyboardPreviewDialog({
  notes,
  beatsPerBar,
  totalBeats,
  bpm,
  open,
  onClose,
}: KeyboardPreviewProps) {
  const { language, meta, setMeta } = useAppContext()
  const t = getTranslations(language)
  const theme = useTheme()

  const themeDefaultMode = theme.palette.mode as 'light' | 'dark'

  // 未手动切换时跟随主题；用户切换后固定下来，关闭时清空。
  const [scoreModeOverride, setScoreModeOverride] = useState<
    'light' | 'dark' | null
  >(null)
  const scoreMode = scoreModeOverride ?? themeDefaultMode

  const [barsPerLine, setBarsPerLine] = useState(2)
  const [includeQR, setIncludeQR] = useState(true)

  const previewRef = useRef<HTMLDivElement>(null)

  const handleClose = () => {
    setScoreModeOverride(null)
    onClose()
  }

  const fileName = (meta.title.trim() || 'harmonica-score').replace(
    /[\\/:*?"<>|]/g,
    '_',
  )

  const doExport = async (format: 'png' | 'svg') => {
    const el = previewRef.current
    if (!el) return
    const svg = el.querySelector('svg')
    if (!svg) return

    const bgColor = scoreMode === 'dark' ? '#1e1e1e' : '#ffffff'
    const serializer = new XMLSerializer()
    const svgClone = svg.cloneNode(true) as SVGSVGElement
    svgClone.setAttribute('font-family', EXPORT_FONT_FAMILY)

    const bgRect = document.createElementNS(
      'http://www.w3.org/2000/svg',
      'rect',
    )
    bgRect.setAttribute('width', '100%')
    bgRect.setAttribute('height', '100%')
    bgRect.setAttribute('fill', bgColor)
    svgClone.insertBefore(bgRect, svgClone.firstChild)

    const svgString = serializer.serializeToString(svgClone)

    if (format === 'svg') {
      await saveFile(svgString, {
        defaultFileName: `${fileName}.svg`,
        filters: [{ name: 'SVG', extensions: ['svg'] }],
        mimeType: 'image/svg+xml;charset=utf-8',
      })
      return
    }

    // PNG：先将 SVG 光栅化到 canvas，再生成 Blob
    const svgBlob = new Blob([svgString], {
      type: 'image/svg+xml;charset=utf-8',
    })
    const url = URL.createObjectURL(svgBlob)

    try {
      const img = new Image()
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve()
        img.onerror = () => reject(new Error('svg-render-failed'))
        img.src = url
      })

      const canvas = document.createElement('canvas')
      canvas.width = svg.clientWidth * 2
      canvas.height = svg.clientHeight * 2
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      ctx.fillStyle = bgColor
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.scale(2, 2)
      ctx.drawImage(img, 0, 0)

      const blob = await new Promise<Blob | null>(resolve => {
        canvas.toBlob(resolve, 'image/png')
      })
      if (!blob) return

      await saveFile(blob, {
        defaultFileName: `${fileName}.png`,
        filters: [{ name: 'PNG', extensions: ['png'] }],
        mimeType: 'image/png',
      })
    } finally {
      URL.revokeObjectURL(url)
    }
  }

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="lg" fullWidth>
      <DialogTitle>{t.keyboardPreview.title}</DialogTitle>
      <DialogContent dividers>
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 1.5 }}>
          <TextField
            size="small"
            label={t.dialogs.title}
            value={meta.title}
            onChange={(e) => setMeta({ ...meta, title: e.target.value })}
            sx={{ width: 220 }}
          />
          <TextField
            size="small"
            label={t.dialogs.composer}
            value={meta.composer}
            onChange={(e) => setMeta({ ...meta, composer: e.target.value })}
            sx={{ width: 180 }}
          />
          <TextField
            size="small"
            label={t.dialogs.transcriber}
            value={meta.transcriber}
            onChange={(e) => setMeta({ ...meta, transcriber: e.target.value })}
            sx={{ width: 180 }}
          />
        </Box>

        <Stack
          direction="row"
          spacing={2}
          alignItems="center"
          sx={{ mb: 2, flexWrap: 'wrap', rowGap: 1 }}
        >
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

          <ToggleButtonGroup
            size="small"
            exclusive
            value={scoreMode}
            onChange={(_, v: 'light' | 'dark' | null) => {
              if (v) setScoreModeOverride(v)
            }}
          >
            <ToggleButton value="light" sx={{ px: 1, py: 0.4 }}>
              <LightModeIcon fontSize="small" />
            </ToggleButton>
            <ToggleButton value="dark" sx={{ px: 1, py: 0.4 }}>
              <DarkModeIcon fontSize="small" />
            </ToggleButton>
          </ToggleButtonGroup>

          <FormControlLabel
            control={
              <Checkbox
                size="small"
                checked={includeQR}
                onChange={(e) => setIncludeQR(e.target.checked)}
              />
            }
            label={t.keyboardPreview.includeQR}
            sx={{ ml: 0 }}
          />

          <Box sx={{ flexGrow: 1 }} />

          <Button
            variant="contained"
            startIcon={<DownloadIcon />}
            onClick={() => void doExport('png')}
            size="small"
          >
            PNG
          </Button>
          <Button
            variant="outlined"
            onClick={() => void doExport('svg')}
            size="small"
          >
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
            bpm={bpm}
            barsPerLine={barsPerLine}
            title={meta.title}
            composer={meta.composer}
            transcriber={meta.transcriber}
            mode={scoreMode}
            includeQR={includeQR}
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>{t.dialogs.close}</Button>
      </DialogActions>
    </Dialog>
  )
}