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
  ListItemIcon,
  ListItemText,
  ToggleButton,
  ToggleButtonGroup,
} from '@mui/material'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import StopIcon from '@mui/icons-material/Stop'
import FileOpenIcon from '@mui/icons-material/FileOpen'
import SaveAltIcon from '@mui/icons-material/SaveAlt'
import UploadFileIcon from '@mui/icons-material/UploadFile'
import SaveIcon from '@mui/icons-material/Save'
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf'
import AudiotrackIcon from '@mui/icons-material/Audiotrack'
import NotesIcon from '@mui/icons-material/Notes'
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
import GitHubIcon from '@mui/icons-material/GitHub'
import { useState } from 'react'
import { useAppContext } from '../contexts/useAppContext'
import { getTranslations } from '../i18n/translations'
import { playNotes, stopPlayback } from '../utils/audio'
import { openExternal } from '../utils/openExternal'
import type { Language } from '../types'

export type ViewMode = 'compose' | 'perform'

interface ToolbarProps {
  onImportAbc: () => void
  onImportScore: () => void
  onExportAbc: () => void
  onExportScore: () => void
  onExportMidi: () => void
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

const GITHUB_URL = 'https://github.com/DilemmaGX/df-harmonica'

/**
 * 数字输入框（BPM、拍/小节）的通用样式：
 * - 强制 label 不省略（otherwise 中文 label 会被截断）
 * - 缩小 label 与 input 字号，节省竖直空间
 * - 输入框本身使用固定高度，配合 Toolbar 的 minHeight 保证 label 有处可放
 */
const numberFieldSx = {
  '& .MuiInputLabel-root': {
    fontSize: 11,
    whiteSpace: 'nowrap',
    overflow: 'visible',
    textOverflow: 'clip',
    // 收缩时 label 向上浮动，使用负偏移使其尽量靠近输入框顶边
    '&.MuiInputLabel-shrink': {
      transform: 'translate(12px, -6px) scale(0.85)',
      transformOrigin: 'top left',
    },
  },
  '& .MuiOutlinedInput-root': {
    height: 34,
  },
  '& .MuiOutlinedInput-input': {
    fontSize: 13,
    padding: '4px 6px',
  },
} as const

export function Toolbar({
  onImportAbc,
  onImportScore,
  onExportAbc,
  onExportScore,
  onExportMidi,
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

  const [importMenuAnchor, setImportMenuAnchor] = useState<HTMLElement | null>(
    null,
  )
  const importMenuOpen = Boolean(importMenuAnchor)

  const [exportMenuAnchor, setExportMenuAnchor] = useState<HTMLElement | null>(
    null,
  )
  const exportMenuOpen = Boolean(exportMenuAnchor)

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
          py: 0.5,
          minHeight: 56,
          flexWrap: 'nowrap',
          overflowX: 'auto',
          // 允许浮动 label 上溢时不被裁切
          overflowY: 'visible',
        }}
      >
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

        <Tooltip title={t.toolbar.import}>
          <span>
            <IconButton
              size="small"
              onClick={(e) => setImportMenuAnchor(e.currentTarget)}
              disabled={!isCompose}
              aria-label={t.toolbar.import}
              aria-haspopup="menu"
            >
              <FileOpenIcon />
            </IconButton>
          </span>
        </Tooltip>
        <Menu
          anchorEl={importMenuAnchor}
          open={importMenuOpen}
          onClose={() => setImportMenuAnchor(null)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
          transformOrigin={{ vertical: 'top', horizontal: 'left' }}
          slotProps={{ paper: { sx: { minWidth: 220, mt: 0.5 } } }}
        >
          <MenuItem
            onClick={() => {
              setImportMenuAnchor(null)
              onImportAbc()
            }}
          >
            <ListItemIcon>
              <NotesIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>{t.toolbar.importAbc}</ListItemText>
          </MenuItem>
          <MenuItem
            onClick={() => {
              setImportMenuAnchor(null)
              onImportScore()
            }}
          >
            <ListItemIcon>
              <UploadFileIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>{t.toolbar.importScore}</ListItemText>
          </MenuItem>
        </Menu>

        <Tooltip title={t.toolbar.export}>
          <span>
            <IconButton
              size="small"
              onClick={(e) => setExportMenuAnchor(e.currentTarget)}
              disabled={!isCompose}
              aria-label={t.toolbar.export}
              aria-haspopup="menu"
            >
              <SaveAltIcon />
            </IconButton>
          </span>
        </Tooltip>
        <Menu
          anchorEl={exportMenuAnchor}
          open={exportMenuOpen}
          onClose={() => setExportMenuAnchor(null)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
          transformOrigin={{ vertical: 'top', horizontal: 'left' }}
          slotProps={{ paper: { sx: { minWidth: 220, mt: 0.5 } } }}
        >
          <MenuItem
            onClick={() => {
              setExportMenuAnchor(null)
              onExportAbc()
            }}
          >
            <ListItemIcon>
              <SaveIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>{t.toolbar.exportAbc}</ListItemText>
          </MenuItem>
          <MenuItem
            onClick={() => {
              setExportMenuAnchor(null)
              onExportMidi()
            }}
          >
            <ListItemIcon>
              <AudiotrackIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>{t.toolbar.exportMidi}</ListItemText>
          </MenuItem>
          <MenuItem
            onClick={() => {
              setExportMenuAnchor(null)
              onExportScore()
            }}
          >
            <ListItemIcon>
              <PictureAsPdfIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>{t.toolbar.exportScore}</ListItemText>
          </MenuItem>
        </Menu>

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

        {/* BPM 输入框 */}
        <Tooltip title={t.toolbar.bpmHint}>
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
            sx={{ width: 72, ...numberFieldSx }}
            inputProps={{ min: 40, max: 240, style: { textAlign: 'center' } }}
            variant="outlined"
          />
        </Tooltip>

        {/* 拍/小节 输入框 */}
        <Tooltip title={t.toolbar.beatsPerBarHint}>
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
            sx={{ width: 88, ...numberFieldSx }}
            inputProps={{ min: 1, max: 12, style: { textAlign: 'center' } }}
            variant="outlined"
          />
        </Tooltip>

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

        <Tooltip title={t.settings.github}>
          <IconButton
            size="small"
            color="inherit"
            onClick={() => {
              void openExternal(GITHUB_URL)
            }}
            aria-label={t.settings.github}
          >
            <GitHubIcon />
          </IconButton>
        </Tooltip>

        <Tooltip title={t.settings.theme}>
          <IconButton size="small" onClick={cycleTheme} color="inherit">
            {getThemeIcon()}
          </IconButton>
        </Tooltip>
      </MuiToolbar>
    </AppBar>
  )
}