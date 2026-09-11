import {
  existsSync,
  mkdirSync,
  readdirSync,
  copyFileSync,
  statSync,
} from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const releaseDir = join(root, 'src-tauri', 'target', 'release')
const distDir = join(root, 'dist')

if (!existsSync(releaseDir)) {
  console.error(`[copy-exe] Release directory not found: ${releaseDir}`)
  process.exit(1)
}

const entries = readdirSync(releaseDir)
const exeFiles = entries.filter(
  f => f.endsWith('.exe') && statSync(join(releaseDir, f)).isFile(),
)

if (exeFiles.length === 0) {
  console.error(`[copy-exe] No .exe found in ${releaseDir}`)
  process.exit(1)
}

const preferred = exeFiles.find(f => f === 'df-harmonica.exe')
const exeName = preferred ?? exeFiles[0]

if (!existsSync(distDir)) {
  mkdirSync(distDir, { recursive: true })
}

const src = join(releaseDir, exeName)
const dst = join(distDir, exeName)
copyFileSync(src, dst)

const sizeMb = (statSync(dst).size / (1024 * 1024)).toFixed(2)
console.log(`[copy-exe] Copied ${exeName} (${sizeMb} MB) -> dist/${exeName}`)