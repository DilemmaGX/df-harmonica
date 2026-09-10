import { useEffect, useState } from 'react'
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField, Typography } from '@mui/material'
import { useAppContext } from '../contexts/AppContext'
import { getTranslations } from '../i18n/translations'
import { notesToAbc, abcToNotes } from '../utils/abcConverter'

interface AbcDialogProps {
  open: boolean
  onClose: () => void
  mode: 'import' | 'export'
}

export function AbcDialog({ open, onClose, mode }: AbcDialogProps) {
  const { track, setTrack, language } = useAppContext()
  const t = getTranslations(language)
  const [abcText, setAbcText] = useState('')
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (open && mode === 'export') {
      setAbcText(notesToAbc(track))
      setError('')
    }
    if (open && mode === 'import') {
      setAbcText('')
      setError('')
    }
  }, [open, mode, track])

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
        {mode === 'import' ? t.dialogs.importAbcTitle : t.dialogs.exportAbcTitle}
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