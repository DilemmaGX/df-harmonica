import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  List,
  ListItemButton,
  ListItemText,
  Typography,
} from '@mui/material'
import LibraryMusicIcon from '@mui/icons-material/LibraryMusic'
import { useAppContext } from '../contexts/useAppContext'
import { getTranslations } from '../i18n/translations'
import { EXAMPLES, type ExampleProject } from '../data/examples'

interface ExamplesDialogProps {
  open: boolean
  onClose: () => void
  onSelect: (example: ExampleProject) => void
}

export function ExamplesDialog({
  open,
  onClose,
  onSelect,
}: ExamplesDialogProps) {
  const { language } = useAppContext()
  const t = getTranslations(language)

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{t.examples.title}</DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {t.examples.hint}
        </Typography>
        <List disablePadding>
          {EXAMPLES.map(ex => (
            <ListItemButton
              key={ex.id}
              onClick={() => onSelect(ex)}
              sx={{
                borderRadius: 1,
                border: '1px solid',
                borderColor: 'divider',
                mb: 1,
                gap: 1.5,
              }}
            >
              <LibraryMusicIcon color="primary" />
              <ListItemText
                primary={ex.title}
                primaryTypographyProps={{ fontWeight: 500 }}
              />
            </ListItemButton>
          ))}
        </List>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t.dialogs.close}</Button>
      </DialogActions>
    </Dialog>
  )
}