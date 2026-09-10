import { AppBar, Toolbar as MuiToolbar, IconButton, TextField, Box, Divider, Tooltip, Select, MenuItem, FormControl } from '@mui/material'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import StopIcon from '@mui/icons-material/Stop'
import FileOpenIcon from '@mui/icons-material/FileOpen'
import SaveIcon from '@mui/icons-material/Save'
import DeleteIcon from '@mui/icons-material/Delete'
import UndoIcon from '@mui/icons-material/Undo'
import RedoIcon from '@mui/icons-material/Redo'
import LightModeIcon from '@mui/icons-material/LightMode'
import DarkModeIcon from '@mui/icons-material/DarkMode'
import SettingsBrightnessIcon from '@mui/icons-material/SettingsBrightness'
import PreviewIcon from '@mui/icons-material/Preview'
import { useAppContext } from '../contexts/AppContext'
import { getTranslations } from '../i18n/translations'
import { playNotes, stopPlayback } from '../utils/audio'

interface ToolbarProps {
  onImportAbc: () => void
  onExportAbc: () => void
  onClearAll: () => void
  onOpenKeyboardPreview: () => void
}

export function Toolbar({ onImportAbc, onExportAbc, onClearAll, onOpenKeyboardPreview }: ToolbarProps) {
  const {
    track, setTrack, language, setLanguage, themeMode, setThemeMode,
    isPlaying, setIsPlaying, undo, redo, canUndo, canRedo, addToHistory,
  } = useAppContext()
  const t = getTranslations(language)

  const handlePlay = () => {
    if (isPlaying) {
      stopPlayback()
      setIsPlaying(false)
    } else {
      playNotes(track.notes, track.bpm, () => setIsPlaying(false))
      setIsPlaying(true)
    }
  }

  const cycleTheme = () => {
    if (themeMode === 'light') setThemeMode('dark')
    else if (themeMode === 'dark') setThemeMode('system')
    else setThemeMode('light')
  }

  const getThemeIcon = () => {
    if (themeMode === 'light') return <LightModeIcon />
    if (themeMode === 'dark') return <DarkModeIcon />
    return <SettingsBrightnessIcon />
  }

  const handleClearAll = () => {
    addToHistory()
    onClearAll()
  }

  return (
    <AppBar position="static" color="default" elevation={1} sx={{ backgroundColor: 'background.paper' }}>
      <MuiToolbar variant="dense" sx={{ gap: 1, px: 2, minHeight: 48, flexWrap: 'nowrap', overflowX: 'auto' }}>
        <Tooltip title={isPlaying ? t.toolbar.stop : t.toolbar.play}>
          <IconButton size="small" onClick={handlePlay} color={isPlaying ? 'error' : 'primary'}>
            {isPlaying ? <StopIcon /> : <PlayArrowIcon />}
          </IconButton>
        </Tooltip>

        <Divider orientation="vertical" flexItem />

        <Tooltip title={t.toolbar.undo}>
          <span>
            <IconButton size="small" onClick={undo} disabled={!canUndo}>
              <UndoIcon />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title={t.toolbar.redo}>
          <span>
            <IconButton size="small" onClick={redo} disabled={!canRedo}>
              <RedoIcon />
            </IconButton>
          </span>
        </Tooltip>

        <Divider orientation="vertical" flexItem />

        <Tooltip title={t.toolbar.importAbc}>
          <IconButton size="small" onClick={onImportAbc}>
            <FileOpenIcon />
          </IconButton>
        </Tooltip>
        <Tooltip title={t.toolbar.exportAbc}>
          <IconButton size="small" onClick={onExportAbc}>
            <SaveIcon />
          </IconButton>
        </Tooltip>

        <Divider orientation="vertical" flexItem />

        <Tooltip title={t.toolbar.clear}>
          <IconButton size="small" onClick={handleClearAll} color="warning">
            <DeleteIcon />
          </IconButton>
        </Tooltip>

        <Tooltip title={t.keyboardPreview.title}>
          <IconButton size="small" onClick={onOpenKeyboardPreview}>
            <PreviewIcon />
          </IconButton>
        </Tooltip>

        <Box sx={{ flexGrow: 1 }} />

        <TextField
          label={t.toolbar.bpm}
          type="number"
          size="small"
          value={track.bpm}
          onChange={(e) => {
            const newBpm = Number(e.target.value) || 120
            if (newBpm !== track.bpm) {
              addToHistory()
              setTrack({ ...track, bpm: newBpm })
            }
          }}
          sx={{ width: 70 }}
          inputProps={{ min: 40, max: 240, style: { textAlign: 'center' } }}
          variant="outlined"
        />
        <TextField
          label={t.toolbar.beatsPerBar}
          type="number"
          size="small"
          value={track.beatsPerBar}
          onChange={(e) => {
            const newVal = Number(e.target.value) || 4
            if (newVal !== track.beatsPerBar) {
              addToHistory()
              setTrack({ ...track, beatsPerBar: newVal })
            }
          }}
          sx={{ width: 80 }}
          inputProps={{ min: 1, max: 12, style: { textAlign: 'center' } }}
          variant="outlined"
        />

        <FormControl size="small" sx={{ minWidth: 90 }}>
          <Select
            value={language}
            onChange={(e) => setLanguage(e.target.value as 'zh' | 'en')}
            size="small"
            variant="outlined"
            sx={{ fontSize: '0.875rem' }}
          >
            <MenuItem value="zh">中文</MenuItem>
            <MenuItem value="en">English</MenuItem>
          </Select>
        </FormControl>

        <Tooltip title={t.settings.theme}>
          <IconButton size="small" onClick={cycleTheme} color="inherit">
            {getThemeIcon()}
          </IconButton>
        </Tooltip>
      </MuiToolbar>
    </AppBar>
  )
}