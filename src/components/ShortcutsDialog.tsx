import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Typography,
} from '@mui/material'
import { useAppContext } from '../contexts/useAppContext'
import { getTranslations } from '../i18n/translations'

interface ShortcutsDialogProps {
  open: boolean
  onClose: () => void
}

function ShortcutRow({ keys, label }: { keys: string; label: string }) {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        py: 0.5,
      }}
    >
      <Box
        component="code"
        sx={{
          minWidth: 168,
          px: 1,
          py: 0.25,
          borderRadius: 1,
          bgcolor: 'action.hover',
          fontFamily:
            "'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace",
          fontSize: 12,
          textAlign: 'center',
          whiteSpace: 'nowrap',
        }}
      >
        {keys}
      </Box>
      <Typography variant="body2" sx={{ flex: 1 }}>
        {label}
      </Typography>
    </Box>
  )
}

export function ShortcutsDialog({ open, onClose }: ShortcutsDialogProps) {
  const { language } = useAppContext()
  const t = getTranslations(language)

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{t.shortcuts.title}</DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {t.shortcuts.hint}
        </Typography>

        <Typography variant="subtitle2" color="primary" sx={{ mb: 0.5 }}>
          {t.shortcuts.composeTitle}
        </Typography>

        <Box sx={{ mt: 1, mb: 2 }}>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ fontWeight: 600 }}
          >
            {t.shortcuts.durationSection}
          </Typography>
          <ShortcutRow keys="1" label={t.shortcuts.duration1} />
          <ShortcutRow keys="2" label={t.shortcuts.duration2} />
          <ShortcutRow keys="3" label={t.shortcuts.durationHalf} />
          <ShortcutRow keys="4" label={t.shortcuts.durationQuarter} />
        </Box>

        <Box>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ fontWeight: 600 }}
          >
            {t.shortcuts.actionSection}
          </Typography>
          <ShortcutRow keys="Space" label={t.shortcuts.playStop} />
          <ShortcutRow keys="Ctrl + Z" label={t.shortcuts.undo} />
          <ShortcutRow keys="Ctrl + Y" label={t.shortcuts.redo} />
          <ShortcutRow keys="Ctrl + C" label={t.shortcuts.copy} />
          <ShortcutRow keys="Ctrl + V" label={t.shortcuts.paste} />
          <ShortcutRow keys="Delete" label={t.shortcuts.deleteSelected} />
          <ShortcutRow keys="Esc" label={t.shortcuts.cancel} />
          <ShortcutRow
            keys="Shift + Left Drag"
            label={t.shortcuts.boxSelect}
          />
          <ShortcutRow
            keys="Shift + Right Drag"
            label={t.shortcuts.boxDelete}
          />
          <ShortcutRow keys="Ctrl + Scroll" label={t.shortcuts.zoom} />
          <ShortcutRow keys="Shift + Scroll" label={t.shortcuts.scrollH} />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t.dialogs.close}</Button>
      </DialogActions>
    </Dialog>
  )
}