import { useMemo, useRef, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  TextField,
  Typography,
} from '@mui/material'
import UploadFileIcon from '@mui/icons-material/UploadFile'
import { useAppContext } from '../contexts/useAppContext'
import { getTranslations } from '../i18n/translations'
import {
  parseProjectFile,
  decodeProjectFromQR,
  validateProjectFile,
} from '../utils/projectFormat'
import { extractProjectFromImageFile } from '../utils/imageQRScanner'
import { abcToNotes } from '../utils/abcConverter'
import { parseMidiFile } from '../utils/midiImporter'
import {
  extractMelody,
  MELODY_ALGORITHMS,
  type MelodyAlgorithm,
} from '../utils/melodyExtractor'
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
  /**
   * 检测到「和弦」或「非法音长」、需要走旋律提取流程的工程。
   * 这两类问题都可以通过 melodyExtractor 的「提取 + 量化」一次性修复。
   */
  const [problemProject, setProblemProject] = useState<ProjectFile | null>(null)
  const [melodyAlgorithm, setMelodyAlgorithm] =
    useState<MelodyAlgorithm>('skyline')
  const [fileName, setFileName] = useState('')
  const [error, setError] = useState('')

  /**
   * 用当前算法对 problemProject 提取出的主旋律。
   * 用户切换算法时即时重算，无需任何副作用。
   * 提取结果已自动吸附到 1/4 拍网格。
   */
  const melodyPreview = useMemo(() => {
    if (!problemProject) return null
    return extractMelody(problemProject.track.notes, melodyAlgorithm)
  }, [problemProject, melodyAlgorithm])

  const resetFileInput = () => {
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const reset = () => {
    setPending(null)
    setProblemProject(null)
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

  /**
   * 校验通过后进入暂存流程。
   *
   * 分支：
   *   - 起始拍为负 / 时值为非正 → 硬错误，直接提示（无法自动修复）
   *   - 和弦 / 音长不在 1/4 拍网格上 → 交给旋律提取 + 量化自动修复，
   *     在同一个面板里让用户选算法后再确认
   *   - 其余情况 → 暂存 / 覆盖确认
   */
  const validateAndStage = (project: ProjectFile): void => {
    const result = validateProjectFile(project)
    if (!result.ok) {
      if (result.reason === 'invalidNoteTiming') {
        setError(t.importProject.invalidNoteTimingError)
        resetFileInput()
        return
      }
      // 'invalidChord' 与 'invalidNoteDuration' 均可通过提取 + 量化修复。
      setProblemProject(project)
      setMelodyAlgorithm('skyline')
      resetFileInput()
      return
    }
    stageProject(project)
  }

  /** 用户确认使用转换后的工程：用提取出的旋律替换原有音符 */
  const handleUseConverted = () => {
    if (!problemProject || !melodyPreview) return
    const converted: ProjectFile = {
      ...problemProject,
      track: {
        ...problemProject.track,
        notes: melodyPreview,
      },
    }
    setProblemProject(null)

    // 提取结果已量化到 1/4 拍网格，理论上不应再违反任何约束；
    // 仍再校验一次作为最后一道防线。
    const recheck = validateProjectFile(converted)
    if (!recheck.ok) {
      setError(
        recheck.reason === 'invalidChord'
          ? t.importProject.chordError
          : recheck.reason === 'invalidNoteTiming'
            ? t.importProject.invalidNoteTimingError
            : t.importProject.invalidNoteDurationError,
      )
      resetFileInput()
      return
    }
    stageProject(converted)
  }

  /** 用户选择终止导入 */
  const handleAbort = () => {
    setProblemProject(null)
    setError('')
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    setError('')
    setPending(null)
    setProblemProject(null)

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
      validateAndStage(projectFromMidi)
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

      validateAndStage(project)
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
      validateAndStage(projectJson)
      return
    }

    const projectQR = decodeProjectFromQR(text)
    if (projectQR) {
      validateAndStage(projectQR)
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
      validateAndStage(projectFromAbc)
      return
    }

    setError(t.importProject.parseError)
    resetFileInput()
  }

  const originalCount = problemProject?.track.notes.length ?? 0
  const convertedCount = melodyPreview?.length ?? 0
  const removedCount = Math.max(0, originalCount - convertedCount)

  const algorithmLabel = (a: MelodyAlgorithm): string => {
    switch (a) {
      case 'skyline':
        return t.importProject.algorithmSkyline
      case 'top':
        return t.importProject.algorithmTop
      case 'bottom':
        return t.importProject.algorithmBottom
      case 'longest':
        return t.importProject.algorithmLongest
    }
  }

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        {problemProject
          ? t.importProject.melodyDetectedTitle
          : t.importProject.title}
      </DialogTitle>
      <DialogContent>
        {/* ---------------- 转换面板（和弦 / 非法音长） ---------------- */}
        {problemProject && (
          <>
            <Alert severity="warning" sx={{ mb: 2 }}>
              <Typography variant="body2">
                {t.importProject.melodyDetectedMessage}
              </Typography>
            </Alert>

            <TextField
              select
              size="small"
              fullWidth
              label={t.importProject.melodyAlgorithm}
              value={melodyAlgorithm}
              onChange={(e) =>
                setMelodyAlgorithm(e.target.value as MelodyAlgorithm)
              }
            >
              {MELODY_ALGORITHMS.map(a => (
                <MenuItem key={a} value={a}>
                  {algorithmLabel(a)}
                </MenuItem>
              ))}
            </TextField>

            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: 'block', mt: 2 }}
            >
              {t.importProject.melodyPreview
                .replace('{count}', String(convertedCount))
                .replace('{original}', String(originalCount))
                .replace('{removed}', String(removedCount))}
            </Typography>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: 'block', mt: 0.5 }}
            >
              {t.importProject.melodyQuantizedHint}
            </Typography>
          </>
        )}

        {/* ---------------- 文件选择模式 ---------------- */}
        {!problemProject && !pending && (
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

        {/* ---------------- 覆盖确认模式 ---------------- */}
        {!problemProject && pending && (
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
        {problemProject ? (
          <>
            <Button onClick={handleAbort} color="inherit">
              {t.importProject.abortImport}
            </Button>
            <Button
              onClick={handleUseConverted}
              variant="contained"
              color="primary"
              disabled={!melodyPreview || melodyPreview.length === 0}
            >
              {t.importProject.useConverted}
            </Button>
          </>
        ) : pending ? (
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