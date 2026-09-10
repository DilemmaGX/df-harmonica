# df-harmonica

A score editor for the *Delta Force* harmonica easter egg.

## What it does

- **Piano roll editor** — click to place notes, drag to move, drag either edge to
  resize. Each note is snapped to the nearest 1/4 beat.
- **Score preview & export** — renders the score as a horizontal keyboard
  layout (key labels inside the note blocks) and exports it to PNG or SVG.
- **ABC notation** — import and export standard ABC. Useful for round-tripping
  with tools like EasyABC.
- **Playback** — a simple sawtooth-based synth for auditioning. Click the row
  labels on the left to hear an isolated pitch while editing.
- **Undo / redo** — `Ctrl+Z` / `Ctrl+Y`, plus a toolbar pair.
- **Smart key mapping** — when the same pitch can be produced by multiple key
  combinations (e.g. octave-down `,` vs. octave-up `z`), the exporter picks the
  one that minimizes mouse input across the phrase.

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

The production bundle is deployed to GitHub Pages via the workflow in
`.github/workflows/deploy.yml` on every push to `main`.