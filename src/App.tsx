import { useState, useMemo } from 'react'
import { Box } from '@mui/material'
import { AppProvider, useAppContext } from './contexts/AppContext'
import { Toolbar } from './components/Toolbar'
import { PianoRoll } from './components/PianoRoll'
import { KeyboardPreviewDialog } from './components/KeyboardPreview'
import { AbcDialog } from './components/AbcDialog'

function AppContent() {
  const { track, setTrack, notes } = useAppContext()
  const [abcDialogOpen, setAbcDialogOpen] = useState(false)
  const [abcDialogMode, setAbcDialogMode] = useState<'import' | 'export'>('export')
  const [keyboardPreviewOpen, setKeyboardPreviewOpen] = useState(false)

  const handleClearAll = () => {
    setTrack({ ...track, notes: [] })
  }

  // 实际音符结束拍（不含额外空拍），用于键盘谱
  const actualEndBeat = useMemo(() => {
    if (notes.length === 0) return 0
    return Math.ceil(Math.max(...notes.map(n => n.startBeat + n.durationBeats)))
  }, [notes])

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <Toolbar
        onImportAbc={() => { setAbcDialogMode('import'); setAbcDialogOpen(true) }}
        onExportAbc={() => { setAbcDialogMode('export'); setAbcDialogOpen(true) }}
        onClearAll={handleClearAll}
        onOpenKeyboardPreview={() => setKeyboardPreviewOpen(true)}
      />

      <Box sx={{ flexGrow: 1, display: 'flex', overflow: 'hidden' }}>
        <Box sx={{ flexGrow: 1, minWidth: 0, bgcolor: 'background.default', p: 1 }}>
          <PianoRoll width={800} height={600} />
        </Box>
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
        totalBeats={actualEndBeat}
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