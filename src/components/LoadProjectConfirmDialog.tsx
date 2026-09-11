import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Typography,
} from '@mui/material'
import { useAppContext } from '../contexts/useAppContext'
import { getTranslations } from '../i18n/translations'

interface LoadProjectConfirmDialogProps {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  projectName: string
  noteCount: number
}

export function LoadProjectConfirmDialog({
  open,
  onClose,
  onConfirm,
  projectName,
  noteCount,
}: LoadProjectConfirmDialogProps) {
  const { language } = useAppContext()
  const t = getTranslations(language)

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{t.loadProjectDialog.title}</DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ mb: 1.5 }}>
          {t.loadProjectDialog.message}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {t.importProject.overwriteDetail
            .replace('{name}', projectName || t.importProject.untitled)
            .replace('{notes}', String(noteCount))}
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t.loadProjectDialog.cancel}</Button>
        <Button onClick={onConfirm} color="warning" variant="contained">
          {t.loadProjectDialog.confirm}
        </Button>
      </DialogActions>
    </Dialog>
  )
}