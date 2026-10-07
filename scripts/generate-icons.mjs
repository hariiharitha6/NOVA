// NOVA icon asset refresh.
//
// The canonical identity artwork lives under brand/source/*.svg (the AJ
// monogram, the universal floating bubble and the Windows squircle icon).
// Their rendered exports are copied into resources/ so the packaged app, the
// tray symbol and the installer all carry the final identity.
//
// Re-generate the renders first (brand toolchain), then run:
//   node scripts/generate-icons.mjs
import { copyFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const EXPORT = join(ROOT, 'brand', 'export')

mkdirSync(join(ROOT, 'resources', 'icons'), { recursive: true })

copyFileSync(join(EXPORT, 'icon_512px.png'), join(ROOT, 'resources', 'icon.png'))
copyFileSync(join(EXPORT, 'bubble_32px.png'), join(ROOT, 'resources', 'tray.png'))
copyFileSync(join(EXPORT, 'nova.ico'), join(ROOT, 'resources', 'icons', 'nova.ico'))

console.log('NOVA icons refreshed from brand/export: resources/icon.png, resources/tray.png, resources/icons/nova.ico')