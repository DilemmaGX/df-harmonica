import {
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  List,
  ListItemButton,
  ListItemText,
  Tooltip,
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

/**
 * 难度色阶：1–2 绿（入门 / 简单）、3 金（中等）、4–5 红（进阶 / 高难）。
 */
const DIFFICULTY_COLORS: Record<number, string> = {
  1: '#2e7d32',
  2: '#66bb6a',
  3: '#f9a825',
  4: '#ef6c00',
  5: '#c62828',
}

const DIFFICULTY_BG: Record<number, string> = {
  1: 'rgba(46, 125, 50, 0.12)',
  2: 'rgba(102, 187, 106, 0.15)',
  3: 'rgba(249, 168, 37, 0.15)',
  4: 'rgba(239, 108, 0, 0.15)',
  5: 'rgba(198, 40, 40, 0.15)',
}

function difficultyColor(level: number): string {
  const clamped = Math.max(1, Math.min(5, Math.round(level)))
  return DIFFICULTY_COLORS[clamped]
}

function difficultyBg(level: number): string {
  const clamped = Math.max(1, Math.min(5, Math.round(level)))
  return DIFFICULTY_BG[clamped]
}

export function ExamplesDialog({
  open,
  onClose,
  onSelect,
}: ExamplesDialogProps) {
  const { language } = useAppContext()
  const t = getTranslations(language)

  const difficultyLabel = (level: number): string => {
    switch (level) {
      case 1:
        return t.examples.difficulty1
      case 2:
        return t.examples.difficulty2
      case 3:
        return t.examples.difficulty3
      case 4:
        return t.examples.difficulty4
      default:
        return t.examples.difficulty5
    }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{t.examples.title}</DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {t.examples.hint}
        </Typography>
        <List disablePadding>
          {EXAMPLES.map(ex => {
            const color = difficultyColor(ex.difficulty)
            const bg = difficultyBg(ex.difficulty)
            return (
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
                  primary={ex.title[language]}
                  primaryTypographyProps={{ fontWeight: 500 }}
                />
                <Tooltip
                  arrow
                  title={`${t.examples.difficulty}: ${difficultyLabel(
                    ex.difficulty,
                  )}`}
                >
                  <Chip
                    size="small"
                    label={`${t.examples.difficulty} ${ex.difficulty}`}
                    sx={{
                      flexShrink: 0,
                      fontWeight: 600,
                      color,
                      backgroundColor: bg,
                      border: `1px solid ${color}`,
                      '& .MuiChip-label': {
                        px: 1,
                      },
                    }}
                  />
                </Tooltip>
              </ListItemButton>
            )
          })}
        </List>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t.dialogs.close}</Button>
      </DialogActions>
    </Dialog>
  )
}