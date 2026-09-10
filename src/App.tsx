import { useState, useMemo } from 'react'
import { Box } from '@mui/material'
import { AppProvider, useAppContext } from './contexts/AppContext'
import { Toolbar, type ViewMode } from './components/Toolbar'
import { PianoRoll } from './components/PianoRoll'
import { KeyboardPreviewDialog } from './components/KeyboardPreview'
import { AbcDialog } from './components/AbcDialog'
import { KeyboardSimulator } from './components/KeyboardSimulator'
import { ImportProjectDialog } from './components/ImportProjectDialog'
import { ClearAllDialog } from './components/ClearAllDialog'

function AppContent() {
  const { track, setTrack, notes, meta, setMeta, addToHistory } =
    useAppContext()

  const [abcDialogOpen, setAbcDialogOpen] = useState(false)
  const [abcDialogMode, setAbcDialogMode] = useState<'import' | 'export'>(
    'export',
  )
  const [keyboardPreviewOpen, setKeyboardPreviewOpen] = useState(false)
  const [importProjectOpen, setImportProjectOpen] = useState(false)
  const [clearAllOpen, setClearAllOpen] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>('perform')
  const [performShowScore, setPerformShowScore] = useState(false)

  const handleConfirmClearAll = () => {
    addToHistory()
    setTrack({ ...track, notes: [] })
    setMeta({ title: '', composer: '', transcriber: '' })
    setClearAllOpen(false)
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
        onRequestClearAll={() => setClearAllOpen(true)}
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
            <PianoRoll width={800} height={600} />
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