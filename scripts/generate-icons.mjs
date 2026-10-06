// NOVA icon asset generator. Dependency-free.
// Rasterizes the NovaLogo geometry (see src/components/NovaLogo.tsx) into:
//   resources/icon.png        512px master
//   resources/tray.png         32px tray/floating symbol
//   resources/icons/nova.ico   16/20/24/32/48/64 (BMP DIB) + 128/256 (PNG)
// Run: node scripts/generate-icons.mjs
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

// ── Geometry (viewBox space 0..96) ────────────────────────────────────────
// Rounded diamond container (quadratic corners approximated by the SDF below).
const D = { cx: 48, cy: 48, r: 42, round: 9 }
// A — outer triangle hole
const TRI = [[37, 28], [50, 60], [24, 60]]
// A — crossbar re-entry (solid inside the triangle hole)
const BAR = { x0: 30, y0: 49, x1: 44, y1: 55 }
// J — stem rect, quarter annulus hook, terminal tab
const STEM = { x0: 57, y0: 34, x1: 64, y1: 52 }
const HOOK = { cx: 54, cy: 52, rIn: 3.5, rOut: 10 }
const TAB = { x0: 51, y0: 55, x1: 54, y1: 62 }
// nova spark — four-point star
const STAR = [
  [48, 12], [50.6, 17.4], [56, 20], [50.6, 22.6],
  [48, 28], [45.4, 22.6], [40, 20], [45.4, 17.4],
]
const GRAD = [
  [0xc0 / 255, 0x84 / 255, 0xfc / 255],
  [0x8b / 255, 0x5c / 255, 0xf6 / 255],
  [0x6d / 255, 0x28 / 255, 0xd9 / 255],
]

function inDiamond(x, y) {
  // Rounded-rect SDF in the rotated (diamond) frame.
  const u = (x - D.cx + y - D.cy) / Math.SQRT2
  const v = (x - D.cx - (y - D.cy)) / Math.SQRT2
  const k = D.r - D.round
  const qu = Math.abs(u) - k
  const qv = Math.abs(v) - k
  const outside = Math.hypot(Math.max(qu, 0), Math.max(qv, 0))
  const inside = Math.min(Math.max(qu, qv), 0)
  return outside + inside - D.round <= 0
}

function inPoly(poly, x, y) {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]
    const [xj, yj] = poly[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

const inTri = (x, y) => inPoly(TRI, x, y)
const inBar = (x, y) => x >= BAR.x0 && x <= BAR.x1 && y >= BAR.y0 && y <= BAR.y1
const inStem = (x, y) => x >= STEM.x0 && x <= STEM.x1 && y >= STEM.y0 && y <= STEM.y1
const inTab = (x, y) => x >= TAB.x0 && x <= TAB.x1 && y >= TAB.y0 && y <= TAB.y1
function inHook(x, y) {
  const dx = x - HOOK.cx
  const dy = y - HOOK.cy
  if (dx < 0 || dy < 0) return false
  const d = Math.hypot(dx, dy)
  return d >= HOOK.rIn && d <= HOOK.rOut
}
const inStar = (x, y) => inPoly(STAR, x, y)

/** Inside the counter (negative-space holes). */
function inCounter(x, y) {
  const a = inTri(x, y) && !inBar(x, y)
  const j = inStem(x, y) || inHook(x, y) || inTab(x, y)
  const s = inStar(x, y)
  return a || j || s
}

function gradColor(x, y, size) {
  // Diagonal royal gradient matching the SVG (userSpaceOnUse 20,6 → 76,90),
  // normalised to the current raster size.
  const t = Math.min(1, Math.max(0,
    (((x / size) * 96 - 20) * (76 - 20) + ((y / size) * 96 - 6) * (90 - 6)) /
    (56 * 56 + 84 * 84)))
  const seg = t < 0.55 ? t / 0.55 : (t - 0.55) / 0.45
  const c0 = t < 0.55 ? GRAD[0] : GRAD[1]
  const c1 = t < 0.55 ? GRAD[1] : GRAD[2]
  return [
    Math.round(255 * (c0[0] + (c1[0] - c0[0]) * seg)),
    Math.round(255 * (c0[1] + (c1[1] - c0[1]) * seg)),
    Math.round(255 * (c0[2] + (c1[2] - c0[2]) * seg)),
  ]
}

/** Rasterize at `size`, 4×4 supersampled analytic coverage. Returns RGBA. */
function rasterize(size) {
  const rgba = Buffer.alloc(size * size * 4)
  const SS = 4
  const step = 96 / size / SS
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let cov = 0
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const x = ((px + (sx + 0.5) / SS) * 96) / size
          const y = ((py + (sy + 0.5) / SS) * 96) / size
          if (inDiamond(x, y) && !inCounter(x, y)) cov++
        }
      }
      const a = Math.round((cov / (SS * SS)) * 255)
      const i = (py * size + px) * 4
      if (a > 0) {
        const [r, g, b] = gradColor(px + 0.5, py + 0.5, size)
        rgba[i] = r
        rgba[i + 1] = g
        rgba[i + 2] = b
        rgba[i + 3] = a
      }
    }
  }
  return rgba
}

// ── PNG encoding ──────────────────────────────────────────────────────────
const CRC_TABLE = new Int32Array(256).map((_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c
})
function crc32(buf) {
  let c = 0xffffffff
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length)
  out.writeUInt32BE(data.length, 0)
  out.write(type, 4, 'ascii')
  data.copy(out, 8)
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length)
  return out
}
function encodePng(rgba, size) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1))
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0 // filter none
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// ── ICO assembly ──────────────────────────────────────────────────────────
function dibFromRgba(rgba, size) {
  const header = Buffer.alloc(40)
  header.writeUInt32LE(40, 0)
  header.writeInt32LE(size, 4)
  header.writeInt32LE(size * 2, 8) // XOR + AND heights
  header.writeUInt16LE(1, 12)
  header.writeUInt16LE(32, 14)
  const xor = Buffer.alloc(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const si = (y * size + x) * 4
      const di = ((size - 1 - y) * size + x) * 4
      xor[di] = rgba[si + 2] // B
      xor[di + 1] = rgba[si + 1] // G
      xor[di + 2] = rgba[si] // R
      xor[di + 3] = rgba[si + 3] // A
    }
  }
  const maskStride = Math.ceil(size / 32) * 4
  const and = Buffer.alloc(maskStride * size) // fully transparent-aware mask: 0 bits
  return Buffer.concat([header, xor, and])
}

function buildIco(sizes) {
  const rasters = sizes.map((s) => ({ s, png: s > 64, rgba: rasterize(s) }))
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(rasters.length, 4)
  let offset = 6 + rasters.length * 16
  const entries = []
  const bodies = []
  for (const { s, png, rgba } of rasters) {
    const e = Buffer.alloc(16)
    e[0] = s >= 256 ? 0 : s
    e[1] = s >= 256 ? 0 : s
    e.writeUInt16LE(1, 4)
    e.writeUInt16LE(32, 6)
    const body = png ? encodePng(rgba, s) : dibFromRgba(rgba, s)
    e.writeUInt32LE(body.length, 8)
    e.writeUInt32LE(offset, 12)
    offset += body.length
    entries.push(e)
    bodies.push(body)
  }
  return Buffer.concat([header, ...entries, ...bodies])
}

// ── Emit ──────────────────────────────────────────────────────────────────
mkdirSync(join(ROOT, 'resources', 'icons'), { recursive: true })
writeFileSync(join(ROOT, 'resources', 'icon.png'), encodePng(rasterize(512), 512))
writeFileSync(join(ROOT, 'resources', 'tray.png'), encodePng(rasterize(32), 32))
writeFileSync(join(ROOT, 'resources', 'icons', 'nova.ico'), buildIco([16, 20, 24, 32, 48, 64, 128, 256]))
console.log('NOVA icons generated: resources/icon.png, resources/tray.png, resources/icons/nova.ico')
