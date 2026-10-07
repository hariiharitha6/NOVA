// NOVA final identity — the AJ monogram and its universal floating bubble.
//
// The mark is one interlocked geometric symbol:
//   A — apex + left stroke + crossbar in brushed silver (the structural frame)
//   J — a single continuous crimson stroke that shares the A's right diagonal,
//       descends lower than the frame and sweeps into a bottom hook, its tip
//       tucking up under the A's left foot (elegant negative-space interlock).
// The Windows icon, the tray symbol and the brand asset suite
// (brand/source/*.svg) are generated from this exact geometry, so the app,
// the desktop and the installer all carry one identity. No generic AI logo and
// no blue/purple/cyan gradients.

export type NovaLogoVariant = 'gradient' | 'solid' | 'mono-light' | 'mono-dark'

// AJ geometry (256×256 viewBox; glyph bbox ≈ (26,23)–(197,241)).
export const AJ_J =
  'M122 40 L180 168 C186 208 154 224 118 224 C84 224 60 208 58 180'
export const AJ_FRAME = 'M122 40 L38 158'
export const AJ_CROSSBAR = 'M66 108 L144 102'

interface Palette {
  frame: string
  j: string
  defs: JSX.Element | null
}

function paletteFor(variant: NovaLogoVariant, id: string): Palette {
  switch (variant) {
    case 'gradient':
      return {
        frame: `url(#${id}-s)`,
        j: `url(#${id}-c)`,
        defs: (
          <>
            <linearGradient id={`${id}-s`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#F4F6F8" />
              <stop offset="0.45" stopColor="#C9CFD8" />
              <stop offset="1" stopColor="#8F97A2" />
            </linearGradient>
            <linearGradient id={`${id}-c`} x1="0.2" y1="0" x2="0.9" y2="1">
              <stop offset="0" stopColor="#D84A50" />
              <stop offset="0.55" stopColor="#A92B31" />
              <stop offset="1" stopColor="#8E2026" />
            </linearGradient>
          </>
        ),
      }
    case 'solid':
      return { frame: '#C9CFD8', j: '#B92D32', defs: null }
    case 'mono-light':
      return { frame: '#F1F3F6', j: '#F1F3F6', defs: null }
    case 'mono-dark':
      return { frame: '#191C21', j: '#191C21', defs: null }
  }
}

let uid = 0

export function NovaLogo({
  size = 28,
  variant = 'gradient',
  title = 'NOVA',
  decorative = false,
}: {
  size?: number
  variant?: NovaLogoVariant
  title?: string
  decorative?: boolean
}): JSX.Element {
  const id = `aj${++uid}`
  const pal = paletteFor(variant, id)
  const labelled = !decorative && title !== ''
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 256 256"
      role={labelled ? 'img' : 'presentation'}
      aria-hidden={labelled ? undefined : true}
      aria-label={labelled ? title : undefined}
    >
      {pal.defs}
      <g fill="none" strokeLinecap="round" strokeLinejoin="round" transform="translate(14 -14)">
        <path d={AJ_J} stroke={pal.j} strokeWidth={34} />
        <path d={AJ_FRAME} stroke={pal.frame} strokeWidth={24} />
        <path d={AJ_CROSSBAR} stroke={pal.frame} strokeWidth={18} />
      </g>
    </svg>
  )
}

/**
 * The universal floating bubble: opaque medium-dark graphite body, a metallic
 * gunmetal rim with an extremely thin warm champagne highlight, a faint
 * crimson aura behind the J, and the AJ monogram centered. Designed to stay
 * clearly visible on black, white, grey and colourful wallpapers — identical
 * in light and dark presentations.
 */
export function NovaBubble({
  size = 32,
  title = 'NOVA',
  decorative = false,
}: {
  size?: number
  title?: string
  decorative?: boolean
}): JSX.Element {
  const id = `bub${++uid}`
  const labelled = !decorative && title !== ''
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 256 256"
      role={labelled ? 'img' : 'presentation'}
      aria-hidden={labelled ? undefined : true}
      aria-label={labelled ? title : undefined}
    >
      <defs>
        <radialGradient id={`${id}-rim`} cx="0.34" cy="0.28" r="1.05">
          <stop offset="0" stopColor="#8A929C" />
          <stop offset="0.35" stopColor="#565D67" />
          <stop offset="0.72" stopColor="#33373E" />
          <stop offset="1" stopColor="#262A30" />
        </radialGradient>
        <radialGradient id={`${id}-gr`} cx="0.36" cy="0.3" r="1.1">
          <stop offset="0" stopColor="#32353C" />
          <stop offset="0.5" stopColor="#23262C" />
          <stop offset="1" stopColor="#181A1F" />
        </radialGradient>
        <linearGradient id={`${id}-ch`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#E9E0CF" stopOpacity="0" />
          <stop offset="0.5" stopColor="#F3ECDF" stopOpacity="0.85" />
          <stop offset="1" stopColor="#E9E0CF" stopOpacity="0" />
        </linearGradient>
        <radialGradient id={`${id}-rg`}>
          <stop offset="0" stopColor="#C22E33" stopOpacity="0.4" />
          <stop offset="1" stopColor="#C22E33" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${id}-s`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#F4F6F8" />
          <stop offset="0.45" stopColor="#C9CFD8" />
          <stop offset="1" stopColor="#8F97A2" />
        </linearGradient>
        <linearGradient id={`${id}-c`} x1="0.2" y1="0" x2="0.9" y2="1">
          <stop offset="0" stopColor="#D84A50" />
          <stop offset="0.55" stopColor="#A92B31" />
          <stop offset="1" stopColor="#8E2026" />
        </linearGradient>
      </defs>
      <circle cx="128" cy="128" r="117" fill={`url(#${id}-rim)`} />
      <circle cx="128" cy="128" r="111" fill={`url(#${id}-gr)`} />
      <path
        d="M 46 84 A 94 94 0 0 1 210 84"
        fill="none"
        stroke={`url(#${id}-ch)`}
        strokeWidth="3"
        strokeLinecap="round"
        opacity="0.6"
      />
      <ellipse cx="128" cy="150" rx="60" ry="34" fill={`url(#${id}-rg)`} />
      <g
        transform="translate(128 124) scale(0.72) translate(-111.5 -132)"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d={AJ_J} stroke={`url(#${id}-c)`} strokeWidth={34} />
        <path d={AJ_FRAME} stroke={`url(#${id}-s)`} strokeWidth={24} />
        <path d={AJ_CROSSBAR} stroke={`url(#${id}-s)`} strokeWidth={18} />
      </g>
    </svg>
  )
}