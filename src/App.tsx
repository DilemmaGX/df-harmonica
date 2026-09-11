import { useEffect, useState, useMemo } from 'react'
import { Box } from '@mui/material'
import { AppProvider } from './contexts/AppContext'
import { useAppContext } from './contexts/useAppContext'
import { Toolbar, type ViewMode } from './components/Toolbar'
import { PianoRoll } from './components/PianoRoll'
import { KeyboardPreviewDialog } from './components/KeyboardPreview'
import { AbcDialog } from './components/AbcDialog'
import { KeyboardSimulator } from './components/KeyboardSimulator'
import { ImportProjectDialog } from './components/ImportProjectDialog'
import { ClearAllDialog } from './components/ClearAllDialog'
import { ExamplesDialog } from './components/ExamplesDialog'
import { LoadProjectConfirmDialog } from './components/LoadProjectConfirmDialog'
import { abcToNotes } from './utils/abcConverter'
import { downloadMidi } from './utils/midiExporter'
import type { ProjectFile } from './types'
import type { ExampleProject } from './data/examples'

/**
 * 全局禁用浏览器原生缩放：
 * - Ctrl / Cmd + 滚轮
 * - Ctrl / Cmd + `+` / `-` / `=`
 * - Ctrl / Cmd + `0`
 *
 * 应用自身的缩放（例如 PianoRoll 的时间线宽度）通过各自的
 * `onWheel` / `onKeyDown` 处理，不受此拦截影响。
 */
function useDisableNativeZoom() {
  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault()
      }
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return
      const k = e.key
      if (
        k === '+' ||
        k === '=' ||
        k === '-' ||
        k === '_' ||
        k === '0'
      ) {
        e.preventDefault()
      }
    }

    // passive: false 才允许在 wheel 回调中调用 preventDefault
    window.addEventListener('wheel', onWheel, { passive: false })
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('wheel', onWheel)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [])
}

function AppContent() {
  useDisableNativeZoom()

  const {
    track,
    setTrack,
    notes,
    meta,
    setMeta,
    addToHistory,
    setPlayStartBeat,
  } = useAppContext()

  const [abcDialogOpen, setAbcDialogOpen] = useState(false)
  const [abcDialogMode, setAbcDialogMode] = useState<'import' | 'export'>(
    'export',
  )
  const [keyboardPreviewOpen, setKeyboardPreviewOpen] = useState(false)
  const [importProjectOpen, setImportProjectOpen] = useState(false)
  const [clearAllOpen, setClearAllOpen] = useState(false)
  const [examplesOpen, setExamplesOpen] = useState(false)
  const [pendingProject, setPendingProject] = useState<ProjectFile | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('perform')
  const [performShowScore, setPerformShowScore] = useState(false)

  const handleConfirmClearAll = () => {
    addToHistory()
    setTrack({ ...track, notes: [] })
    setMeta({ title: '', composer: '', transcriber: '' })
    setClearAllOpen(false)
  }

  const handleExportMidi = () => {
    void downloadMidi(track, meta)
  }

  const applyProject = (project: ProjectFile) => {
    addToHistory()
    setTrack(project.track)
    setMeta(project.meta)
    setPlayStartBeat(0)
  }

  const requestLoadProject = (project: ProjectFile) => {
    if (notes.length > 0) {
      setPendingProject(project)
    } else {
      applyProject(project)
    }
  }

  const handleSelectExample = (example: ExampleProject) => {
    const result = abcToNotes(example.abc)
    if (!result) return
    const project: ProjectFile = {
      format: 'df-harmonica-project',
      version: 1,
      meta: {
        title: example.title,
        composer: '',
        transcriber: '',
      },
      track: {
        notes: result.notes,
        bpm: result.bpm,
        beatsPerBar: result.beatsPerBar,
      },
    }
    setExamplesOpen(false)
    requestLoadProject(project)
  }

  const handleConfirmLoad = () => {
    if (!pendingProject) return
    applyProject(pendingProject)
    setPendingProject(null)
  }

  const actualEndBeat = useMemo(() => {
    if (notes.length === 0) return 0
    return Math.ceil(
      Math.max(...notes.map(n => n.startBeat + n.durationBeats)),
    )
  }, [notes])

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <Toolbar
        onImportAbc={() => {
          setAbcDialogMode('import')
          setAbcDialogOpen(true)
        }}
        onImportScore={() => setImportProjectOpen(true)}
        onExportAbc={() => {
          setAbcDialogMode('export')
          setAbcDialogOpen(true)
        }}
        onExportScore={() => setKeyboardPreviewOpen(true)}
        onExportMidi={handleExportMidi}
        onRequestClearAll={() => setClearAllOpen(true)}
        onOpenExamples={() => setExamplesOpen(true)}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        performShowScore={performShowScore}
        onTogglePerformScore={() => setPerformShowScore(s => !s)}
      />

      <Box sx={{ flexGrow: 1, display: 'flex', overflow: 'hidden' }}>
        {viewMode === 'compose' ? (
          <Box
            sx={{
              flexGrow: 1,
              minWidth: 0,
              bgcolor: 'background.default',
              p: 1,
            }}
          >
            <PianoRoll />
          </Box>
        ) : (
          <Box sx={{ flexGrow: 1, minWidth: 0, overflow: 'hidden' }}>
            <KeyboardSimulator showScore={performShowScore} />
          </Box>
        )}
      </Box>

      <AbcDialog
        open={abcDialogOpen}
        onClose={() => setAbcDialogOpen(false)}
        mode={abcDialogMode}
      />

      <KeyboardPreviewDialog
        open={keyboardPreviewOpen}
        onClose={() => setKeyboardPreviewOpen(false)}
        notes={notes}
        beatsPerBar={track.beatsPerBar}
        bpm={track.bpm}
        totalBeats={actualEndBeat}
      />

      <ImportProjectDialog
        open={importProjectOpen}
        onClose={() => setImportProjectOpen(false)}
      />

      <ExamplesDialog
        open={examplesOpen}
        onClose={() => setExamplesOpen(false)}
        onSelect={handleSelectExample}
      />

      <LoadProjectConfirmDialog
        open={pendingProject !== null}
        onClose={() => setPendingProject(null)}
        onConfirm={handleConfirmLoad}
        projectName={pendingProject?.meta.title ?? ''}
        noteCount={pendingProject?.track.notes.length ?? 0}
      />

      <ClearAllDialog
        open={clearAllOpen}
        onClose={() => setClearAllOpen(false)}
        onConfirm={handleConfirmClearAll}
      />
    </Box>
  )
}

export default function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  )
}