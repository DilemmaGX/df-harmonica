import { useRef, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Typography,
} from '@mui/material'
import UploadFileIcon from '@mui/icons-material/UploadFile'
import { useAppContext } from '../contexts/useAppContext'
import { getTranslations } from '../i18n/translations'
import { parseProjectFile, decodeProjectFromQR } from '../utils/projectFormat'
import { extractProjectFromImageFile } from '../utils/imageQRScanner'
import { abcToNotes } from '../utils/abcConverter'
import { parseMidiFile } from '../utils/midiImporter'
import type { ProjectFile } from '../types'

interface ImportProjectDialogProps {
  open: boolean
  onClose: () => void
}

const IMAGE_EXT_RE = /\.(png|jpe?g|svg|webp|gif|bmp)$/i
const MIDI_EXT_RE = /\.(mid|midi|smf)$/i

function isImageFile(file: File): boolean {
  if (file.type.startsWith('image/')) return true
  return IMAGE_EXT_RE.test(file.name)
}

function isMidiFile(file: File): boolean {
  if (
    file.type === 'audio/midi' ||
    file.type === 'audio/x-midi' ||
    file.type === 'audio/sp-midi'
  ) {
    return true
  }
  return MIDI_EXT_RE.test(file.name)
}

export function ImportProjectDialog({
  open,
  onClose,
}: ImportProjectDialogProps) {
  const { language, track, setTrack, setMeta } = useAppContext()
  const t = getTranslations(language)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [pending, setPending] = useState<ProjectFile | null>(null)
  const [fileName, setFileName] = useState('')
  const [error, setError] = useState('')

  const resetFileInput = () => {
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const reset = () => {
    setPending(null)
    setFileName('')
    setError('')
    resetFileInput()
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  const applyProject = (project: ProjectFile) => {
    setTrack(project.track)
    setMeta(project.meta)
    reset()
    onClose()
  }

  const stageProject = (project: ProjectFile) => {
    if (track.notes.length > 0) {
      setPending(project)
    } else {
      applyProject(project)
    }
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    setError('')
    setPending(null)

    // ---------------- MIDI 路径 ----------------
    if (isMidiFile(file)) {
      let buffer: ArrayBuffer
      try {
        buffer = await file.arrayBuffer()
      } catch {
        setError(t.importProject.readError)
        resetFileInput()
        return
      }

      const result = parseMidiFile(new Uint8Array(buffer))
      if (!result) {
        setError(t.importProject.midiParseError)
        resetFileInput()
        return
      }

      const projectFromMidi: ProjectFile = {
        format: 'df-harmonica-project',
        version: 1,
        meta: {
          title: file.name.replace(/\.[^.]+$/, ''),
          composer: '',
          transcriber: '',
        },
        track: {
          notes: result.notes,
          bpm: result.bpm,
          beatsPerBar: result.beatsPerBar,
        },
      }
      stageProject(projectFromMidi)
      return
    }

    // ---------------- 图片路径：扫描二维码 ----------------
    if (isImageFile(file)) {
      let project: ProjectFile | null = null
      try {
        project = await extractProjectFromImageFile(file)
      } catch {
        setError(t.importProject.readError)
        resetFileInput()
        return
      }

      if (!project) {
        setError(t.importProject.noQRFound)
        resetFileInput()
        return
      }

      stageProject(project)
      return
    }

    // ---------------- 文本路径 ----------------
    let text = ''
    try {
      text = await file.text()
    } catch {
      setError(t.importProject.readError)
      resetFileInput()
      return
    }

    const projectJson = parseProjectFile(text)
    if (projectJson) {
      stageProject(projectJson)
      return
    }

    const projectQR = decodeProjectFromQR(text)
    if (projectQR) {
      stageProject(projectQR)
      return
    }

    const abc = abcToNotes(text)
    if (abc) {
      const projectFromAbc: ProjectFile = {
        format: 'df-harmonica-project',
        version: 1,
        meta: {
          title: file.name.replace(/\.[^.]+$/, ''),
          composer: '',
          transcriber: '',
        },
        track: {
          notes: abc.notes,
          bpm: abc.bpm,
          beatsPerBar: abc.beatsPerBar,
        },
      }
      stageProject(projectFromAbc)
      return
    }

    setError(t.importProject.parseError)
    resetFileInput()
  }

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>{t.importProject.title}</DialogTitle>
      <DialogContent>
        {!pending && (
          <>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              {t.importProject.hint}
            </Typography>
            <Box
              component="label"
              sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 1,
                py: 5,
                px: 2,
                border: '2px dashed',
                borderColor: 'divider',
                borderRadius: 2,
                cursor: 'pointer',
                transition: 'border-color 0.2s, background-color 0.2s',
                '&:hover': {
                  borderColor: 'primary.main',
                  bgcolor: 'action.hover',
                },
              }}
            >
              <UploadFileIcon fontSize="large" color="primary" />
              <Typography variant="body2" color="text.secondary">
                {t.importProject.chooseFile}
              </Typography>
              <input
                ref={fileInputRef}
                type="file"
                hidden
                accept=".json,.abc,.txt,.mid,.midi,.smf,.png,.jpg,.jpeg,.svg,.webp,.gif,.bmp,application/json,text/plain,audio/midi,audio/x-midi,audio/sp-midi,image/*"
                onChange={handleFileSelect}
              />
            </Box>
            {fileName && (
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ mt: 1, display: 'block' }}
              >
                {fileName}
              </Typography>
            )}
            {error && (
              <Alert severity="error" sx={{ mt: 2 }}>
                {error}
              </Alert>
            )}
          </>
        )}

        {pending && (
          <Alert severity="warning">
            <Typography variant="body2" sx={{ mb: 1 }}>
              {t.importProject.confirmOverwrite}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {t.importProject.overwriteDetail
                .replace(
                  '{name}',
                  pending.meta.title || t.importProject.untitled,
                )
                .replace('{notes}', String(pending.track.notes.length))}
            </Typography>
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        {pending ? (
          <>
            <Button onClick={reset}>{t.importProject.back}</Button>
            <Button
              onClick={() => applyProject(pending)}
              variant="contained"
              color="warning"
            >
              {t.importProject.confirm}
            </Button>
          </>
        ) : (
          <Button onClick={handleClose}>{t.dialogs.close}</Button>
        )}
      </DialogActions>
    </Dialog>
  )
}