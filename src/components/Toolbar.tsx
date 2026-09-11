import {
  AppBar,
  Toolbar as MuiToolbar,
  IconButton,
  TextField,
  Box,
  Divider,
  Tooltip,
  MenuItem,
  Menu,
  ToggleButton,
  ToggleButtonGroup,
} from '@mui/material'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import StopIcon from '@mui/icons-material/Stop'
import FileOpenIcon from '@mui/icons-material/FileOpen'
import UploadFileIcon from '@mui/icons-material/UploadFile'
import SaveIcon from '@mui/icons-material/Save'
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf'
import DeleteIcon from '@mui/icons-material/Delete'
import UndoIcon from '@mui/icons-material/Undo'
import RedoIcon from '@mui/icons-material/Redo'
import LightModeIcon from '@mui/icons-material/LightMode'
import DarkModeIcon from '@mui/icons-material/DarkMode'
import SettingsBrightnessIcon from '@mui/icons-material/SettingsBrightness'
import VisibilityIcon from '@mui/icons-material/Visibility'
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff'
import MusicNoteIcon from '@mui/icons-material/MusicNote'
import PianoIcon from '@mui/icons-material/Piano'
import LanguageIcon from '@mui/icons-material/Language'
import CheckIcon from '@mui/icons-material/Check'
import LibraryMusicIcon from '@mui/icons-material/LibraryMusic'
import { useState } from 'react'
import { useAppContext } from '../contexts/AppContext'
import { getTranslations } from '../i18n/translations'
import { playNotes, stopPlayback } from '../utils/audio'
import type { Language } from '../types'

export type ViewMode = 'compose' | 'perform'

interface ToolbarProps {
  onImportAbc: () => void
  onImportScore: () => void
  onExportAbc: () => void
  onExportScore: () => void
  onRequestClearAll: () => void
  onOpenExamples: () => void
  viewMode: ViewMode
  onViewModeChange: (mode: ViewMode) => void
  performShowScore: boolean
  onTogglePerformScore: () => void
}

const LANGUAGE_OPTIONS: { value: Language; label: string }[] = [
  { value: 'zh', label: '中文' },
  { value: 'en', label: 'English' },
]

export function Toolbar({
  onImportAbc,
  onImportScore,
  onExportAbc,
  onExportScore,
  onRequestClearAll,
  onOpenExamples,
  viewMode,
  onViewModeChange,
  performShowScore,
  onTogglePerformScore,
}: ToolbarProps) {
  const {
    track,
    setTrack,
    language,
    setLanguage,
    themeMode,
    setThemeMode,
    isPlaying,
    setIsPlaying,
    undo,
    redo,
    canUndo,
    canRedo,
    addToHistory,
    playStartBeat,
  } = useAppContext()
  const t = getTranslations(language)

  const [langMenuAnchor, setLangMenuAnchor] = useState<HTMLElement | null>(null)
  const langMenuOpen = Boolean(langMenuAnchor)

  const handlePlay = () => {
    if (isPlaying) {
      stopPlayback()
      setIsPlaying(false)
    } else {
      playNotes(
        track.notes,
        track.bpm,
        () => setIsPlaying(false),
        playStartBeat,
      )
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

  const isCompose = viewMode === 'compose'

  return (
    <AppBar
      position="static"
      color="default"
      elevation={1}
      sx={{ backgroundColor: 'background.paper' }}
    >
      <MuiToolbar
        variant="dense"
        sx={{
          gap: 1,
          px: 2,
          minHeight: 48,
          flexWrap: 'nowrap',
          overflowX: 'auto',
        }}
      >
        {/* 业务切换：演奏在左（默认），谱曲在右 */}
        <ToggleButtonGroup
          size="small"
          exclusive
          value={viewMode}
          onChange={(_, v: ViewMode | null) => {
            if (v) onViewModeChange(v)
          }}
          sx={{ mr: 0.5 }}
        >
          <ToggleButton value="perform" sx={{ px: 1.2, py: 0.4 }}>
            <Tooltip title={t.toolbar.performMode}>
              <PianoIcon fontSize="small" />
            </Tooltip>
          </ToggleButton>
          <ToggleButton value="compose" sx={{ px: 1.2, py: 0.4 }}>
            <Tooltip title={t.toolbar.composeMode}>
              <MusicNoteIcon fontSize="small" />
            </Tooltip>
          </ToggleButton>
        </ToggleButtonGroup>

        <Divider orientation="vertical" flexItem />

        {/* 演奏模式：键盘谱显隐按钮 */}
        {viewMode === 'perform' && (
          <>
            <Tooltip title={t.keyboardPreview.title}>
              <IconButton
                size="small"
                onClick={onTogglePerformScore}
                color={performShowScore ? 'primary' : 'default'}
              >
                {performShowScore ? <VisibilityOffIcon /> : <VisibilityIcon />}
              </IconButton>
            </Tooltip>
            <Divider orientation="vertical" flexItem />
          </>
        )}

        <Tooltip title={isPlaying ? t.toolbar.stop : t.toolbar.play}>
          <span>
            <IconButton
              size="small"
              onClick={handlePlay}
              color={isPlaying ? 'error' : 'primary'}
              disabled={!isCompose}
            >
              {isPlaying ? <StopIcon /> : <PlayArrowIcon />}
            </IconButton>
          </span>
        </Tooltip>

        <Divider orientation="vertical" flexItem />

        <Tooltip title={t.toolbar.undo}>
          <span>
            <IconButton
              size="small"
              onClick={undo}
              disabled={!canUndo || !isCompose}
            >
              <UndoIcon />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title={t.toolbar.redo}>
          <span>
            <IconButton
              size="small"
              onClick={redo}
              disabled={!canRedo || !isCompose}
            >
              <RedoIcon />
            </IconButton>
          </span>
        </Tooltip>

        <Divider orientation="vertical" flexItem />

        {/* 内置示例曲谱 */}
        <Tooltip title={t.toolbar.examples}>
          <span>
            <IconButton
              size="small"
              onClick={onOpenExamples}
              disabled={!isCompose}
            >
              <LibraryMusicIcon />
            </IconButton>
          </span>
        </Tooltip>

        <Divider orientation="vertical" flexItem />

        {/* 导入 / 导出 组 */}
        <Tooltip title={t.toolbar.importAbc}>
          <span>
            <IconButton size="small" onClick={onImportAbc} disabled={!isCompose}>
              <FileOpenIcon />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title={t.toolbar.importScore}>
          <span>
            <IconButton
              size="small"
              onClick={onImportScore}
              disabled={!isCompose}
            >
              <UploadFileIcon />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title={t.toolbar.exportAbc}>
          <span>
            <IconButton size="small" onClick={onExportAbc} disabled={!isCompose}>
              <SaveIcon />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title={t.toolbar.exportScore}>
          <span>
            <IconButton
              size="small"
              onClick={onExportScore}
              disabled={!isCompose}
            >
              <PictureAsPdfIcon />
            </IconButton>
          </span>
        </Tooltip>

        <Divider orientation="vertical" flexItem />

        <Tooltip title={t.toolbar.clear}>
          <span>
            <IconButton
              size="small"
              onClick={onRequestClearAll}
              color="warning"
              disabled={!isCompose}
            >
              <DeleteIcon />
            </IconButton>
          </span>
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

        {/* 语言选择：地球图标 → 下拉菜单 */}
        <Tooltip title={t.settings.language}>
          <IconButton
            size="small"
            onClick={(e) => setLangMenuAnchor(e.currentTarget)}
            color="inherit"
            aria-label={t.settings.language}
            aria-haspopup="menu"
          >
            <LanguageIcon />
          </IconButton>
        </Tooltip>
        <Menu
          anchorEl={langMenuAnchor}
          open={langMenuOpen}
          onClose={() => setLangMenuAnchor(null)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
          transformOrigin={{ vertical: 'top', horizontal: 'right' }}
          slotProps={{ paper: { sx: { minWidth: 140, mt: 0.5 } } }}
        >
          {LANGUAGE_OPTIONS.map(opt => (
            <MenuItem
              key={opt.value}
              selected={opt.value === language}
              onClick={() => {
                setLanguage(opt.value)
                setLangMenuAnchor(null)
              }}
              sx={{ gap: 1 }}
            >
              <CheckIcon
                fontSize="small"
                sx={{
                  visibility: opt.value === language ? 'visible' : 'hidden',
                }}
              />
              {opt.label}
            </MenuItem>
          ))}
        </Menu>

        <Tooltip title={t.settings.theme}>
          <IconButton size="small" onClick={cycleTheme} color="inherit">
            {getThemeIcon()}
          </IconButton>
        </Tooltip>
      </MuiToolbar>
    </AppBar>
  )
}