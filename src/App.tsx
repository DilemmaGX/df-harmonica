import { useState, useMemo } from 'react'
import { Box } from '@mui/material'
import { AppProvider, useAppContext } from './contexts/AppContext'
import { Toolbar, type ViewMode } from './components/Toolbar'
import { PianoRoll } from './components/PianoRoll'
import { KeyboardPreviewDialog } from './components/KeyboardPreview'
import { AbcDialog } from './components/AbcDialog'
import { KeyboardSimulator } from './components/KeyboardSimulator'

function AppContent() {
  const { track, setTrack, notes } = useAppContext()
  const [abcDialogOpen, setAbcDialogOpen] = useState(false)
  const [abcDialogMode, setAbcDialogMode] = useState<'import' | 'export'>('export')
  const [keyboardPreviewOpen, setKeyboardPreviewOpen] = useState(false)
  // 默认进入演奏模式
  const [viewMode, setViewMode] = useState<ViewMode>('perform')
  // 演奏模式下键盘谱显隐（由 Toolbar 按钮控制）
  const [performShowScore, setPerformShowScore] = useState(false)

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
        onImportAbc={() => {
          setAbcDialogMode('import')
          setAbcDialogOpen(true)
        }}
        onExportAbc={() => {
          setAbcDialogMode('export')
          setAbcDialogOpen(true)
        }}
        onClearAll={handleClearAll}
        onOpenKeyboardPreview={() => setKeyboardPreviewOpen(true)}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        performShowScore={performShowScore}
        onTogglePerformScore={() => setPerformShowScore(s => !s)}
      />

      <Box sx={{ flexGrow: 1, display: 'flex', overflow: 'hidden' }}>
        {viewMode === 'compose' ? (
          <Box sx={{ flexGrow: 1, minWidth: 0, bgcolor: 'background.default', p: 1 }}>
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