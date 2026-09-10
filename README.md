# df-harmonica

A score editor and live-performance simulator for the *Delta Force* harmonica
easter egg.

## What it does

The app has two modes, switchable from the toolbar:

- **Perform** (default) — a live-performance simulator. Play the eight
  harmonica keys (`Z X C V B N M ,`) directly on your computer keyboard and
  hear them in real time, exactly like an acoustic instrument. Modifier
  mouse buttons shift the whole keyboard by octave or semitone.
- **Compose** — a full piano-roll editor with ABC import/export, playback,
  undo/redo, and keyboard-score export.

### Perform mode

- **Hold a key** — sustains the pitch for as long as you hold it (no
  note-length presets). Releasing the key stops the sound immediately.
- **Mono playback** — the most recently pressed key wins; pressing a second
  key while the first is still held simply replaces it.
- **Mouse modifiers** (work alongside the keyboard):
  - **Left button** — drop the whole keyboard by one octave
  - **Right button** — raise the whole keyboard by one octave
  - **Middle button** — sharpen every key by one semitone
  - Left and right are **last-press-wins**: hold both and the most recently
    pressed one takes effect; release it and the keyboard falls back to the
    other one that is still held.
- **Visual feedback**:
  - The eight keycaps are tinted with the current octave colour and receive
    a contrasting outline when the sharp modifier is active.
  - The jianpu (numbered notation) column above each key updates live to
    reflect octave dots and sharp signs.
  - A small mouse-shaped indicator below the keyboard lights up the
    currently active buttons.
- **Keyboard-score overlay** — toggle it from the toolbar to slide in the
  score rendered from Compose mode. The indicator shifts down while the
  score is visible.

### Compose mode

- **Piano-roll editor** — click to place notes, drag to move, drag either
  edge to resize. Every note snaps to the nearest 1/4 beat.
- **Smart key mapping** — when a pitch can be produced by more than one
  key combination (e.g. octave-down `,` vs. octave-up `z`), the editor picks
  the one that minimises hand travel across the phrase.
- **Score preview & export** — renders the score as a horizontal keyboard
  layout (key labels inside the note blocks) and exports it to **PNG** or
  **SVG**, in either light or dark mode.
- **ABC notation** — import and export standard ABC. BPM and beats-per-bar
  round-trip automatically via the `Q:` and `M:` headers.
- **Playback** — a simple sawtooth-based synth. Click any row label on the
  left of the piano roll to audition a single pitch while editing.
- **Undo / redo** — `Ctrl+Z` / `Ctrl+Y`, plus a toolbar pair.
- **Copy / paste** — `Ctrl+C` copies the current selection; `Ctrl+V` enters
  a ghost-preview mode, then left-click to place the copied notes.

## Key mapping

| Key | Default | Left-click | Right-click | Middle-click |
|-----|---------|------------|-------------|--------------|
| `z` | C4      | C3         | C5          | C#4          |
| `x` | D4      | D3         | D5          | D#4          |
| `c` | E4      | E3         | E5          | F4           |
| `v` | F4      | F3         | F5          | F#4          |
| `b` | G4      | G3         | G5          | G#4          |
| `n` | A4      | A3         | A5          | A#4          |
| `m` | B4      | B3         | B5          | C5           |
| `,` | C5      | C4         | C6          | C#5          |

> Left and right are last-press-wins. Middle stacks independently on top of
> whichever octave direction is active.

## Octave colour scheme

The same three-colour palette is used across the piano-roll row backgrounds,
the keyboard-score note blocks, and the simulator keycaps, so a phrase looks
consistent everywhere:

| Layer   | Colour | Hex       |
|---------|--------|-----------|
| Low     | Orange | `#ea580c` |
| Default | Purple | `#7c3aed` |
| High    | Sky    | `#0ea5e9` |

## Settings

- **Language** — the toolbar uses a globe icon; click it to open a menu with
  `中文` and `English`, each shown in its own script. The selection is
  persisted.
- **Theme** — the toolbar cycles between **light**, **dark**, and
  **system**. `system` follows your OS preference and updates live when the
  OS switches. The keyboard score in Perform mode inherits the current
  theme automatically; the export dialog has its own light/dark toggle.

## Persistence

The current project, language, and theme are stored in `localStorage` under
the key `df-harmonica:state`. Writes are debounced and flushed synchronously
on page unload.

The stored format carries a schema version, and `src/utils/storage.ts`
implements a migration pipeline so future format changes upgrade cleanly:

- Migrations are defined one per version step (`vN → vN+1`) and chained.
- Data older than the current code is migrated step-by-step until it catches
  up; any missing or failing step falls back to defaults and clears the stale
  payload.
- Data newer than the current code (user downgraded) is discarded.
- After migration the payload is normalised — invalid notes are dropped,
  out-of-range BPM and beats-per-bar are clamped, and unknown theme/language
  values are replaced with defaults.

## Editor shortcuts

| Action | Shortcut |
|--------|----------|
| Play / stop | `Space` |
| Undo / redo | `Ctrl+Z` / `Ctrl+Y` |
| Copy selection | `Ctrl+C` |
| Paste (ghost preview) | `Ctrl+V`, then left-click to place |
| Box select | `Shift` + drag (left button) |
| Box delete | `Shift` + drag (right button) |
| Move selection | Drag any selected note |
| Delete selection | `Delete` |
| Cancel selection / ghost | `Esc` |
| Zoom timeline | `Ctrl` + scroll |
| Scroll horizontally | `Shift` + scroll |

## Running locally

```bash
npm install
npm run dev
```

Build:

```bash
npm run build
npm run preview
```

Lint:

```bash
npm run lint
```

The production bundle is deployed to GitHub Pages via the workflow in
`.github/workflows/deploy.yml` on every push to `main`.

## Example

```
X:1
T:Random Tune
M:4/4
L:1/8
Q:1/4=160
K:C
e2 e2 e e A2 z e e g e e A2
d2 d2 d A c d e e d c e3
```