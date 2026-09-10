import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
} from '@mui/material'
import { useAppContext } from '../contexts/AppContext'
import { getTranslations } from '../i18n/translations'

interface ClearAllDialogProps {
  open: boolean
  onClose: () => void
  onConfirm: () => void
}

export function ClearAllDialog({
  open,
  onClose,
  onConfirm,
}: ClearAllDialogProps) {
  const { language } = useAppContext()
  const t = getTranslations(language)

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{t.clearAllDialog.title}</DialogTitle>
      <DialogContent>
        <DialogContentText>{t.clearAllDialog.message}</DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t.clearAllDialog.cancel}</Button>
        <Button onClick={onConfirm} color="warning" variant="contained">
          {t.clearAllDialog.confirm}
        </Button>
      </DialogActions>
    </Dialog>
  )
}