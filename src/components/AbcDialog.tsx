import { useState } from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Typography,
} from '@mui/material'
import { useAppContext } from '../contexts/useAppContext'
import { getTranslations } from '../i18n/translations'
import { notesToAbc, abcToNotes } from '../utils/abcConverter'

interface AbcDialogProps {
  open: boolean
  onClose: () => void
  mode: 'import' | 'export'
}

/**
 * 通过 key 强制重建内部状态：
 * 每次打开或切换导入/导出模式时，状态由初始值派生，无需在 effect 中 setState。
 */
export function AbcDialog(props: AbcDialogProps) {
  return (
    <AbcDialogInner
      key={`${props.open ? 'open' : 'closed'}-${props.mode}`}
      {...props}
    />
  )
}

function AbcDialogInner({ open, onClose, mode }: AbcDialogProps) {
  const { track, setTrack, language } = useAppContext()
  const t = getTranslations(language)

  const initialAbcText = mode === 'export' ? notesToAbc(track) : ''
  const [abcText, setAbcText] = useState(initialAbcText)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  const handleImport = () => {
    const result = abcToNotes(abcText)
    if (!result) {
      setError(t.dialogs.invalidAbc)
      return
    }
    setTrack({
      notes: result.notes,
      bpm: result.bpm,
      beatsPerBar: result.beatsPerBar,
    })
    setError('')
    onClose()
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(abcText)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // clipboard API not available
    }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        {mode === 'import'
          ? t.dialogs.importAbcTitle
          : t.dialogs.exportAbcTitle}
      </DialogTitle>
      <DialogContent>
        {mode === 'import' && (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            {t.dialogs.pasteAbc}
          </Typography>
        )}
        <TextField
          multiline
          rows={8}
          fullWidth
          value={abcText}
          onChange={(e) => setAbcText(e.target.value)}
          placeholder="X:1&#10;T:Title&#10;M:4/4&#10;K:C&#10;C D E F |"
          sx={{ fontFamily: 'monospace' }}
          error={Boolean(error)}
          helperText={error}
        />
      </DialogContent>
      <DialogActions>
        {mode === 'export' && (
          <Button onClick={handleCopy} color="primary">
            {copied ? t.dialogs.copied : t.dialogs.copy}
          </Button>
        )}
        <Button onClick={onClose}>{t.dialogs.close}</Button>
        {mode === 'import' && (
          <Button onClick={handleImport} variant="contained" color="primary">
            {t.toolbar.importAbc}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  )
}