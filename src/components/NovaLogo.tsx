// NOVA brand symbol — shared by the floating dot, overlay header, settings and
// every generated icon resource (scripts/generate-icons.mjs rasterizes the same
// geometry).
//
// The mark is a royal-cut diamond carrying a negative-space ligature of the
// initials A · J beneath a four-point nova spark:
//   A — triangular counter with a crossbar notch (left)
//   J — descending stem hooked under the A's right foot (right)
// At a glance it reads as a futuristic nova gem; the letters are discoverable,
// never spelled out. Works in colour, royal-purple and pure monochrome.

export type NovaLogoVariant = 'gradient' | 'solid' | 'mono-light' | 'mono-dark'

const DIAMOND =
  'M56.5 15.5 L81.5 39.5 Q90 48 81.5 56.5 L56.5 80.5 Q48 90 39.5 80.5 ' +
  'L14.5 56.5 Q6 48 14.5 39.5 L39.5 15.5 Q48 6 56.5 15.5 Z'

// Compound counter (holes): A triangle + A crossbar re-entry + J stem/hook +
// nova spark. Rendered with evenodd so nested subpaths alternate hole/solid.
const COUNTER =
  // A — outer triangle
  'M37 28 L50 60 L24 60 Z ' +
  // A — crossbar notch (solid again inside the triangle hole)
  'M30 49 H44 V55 H30 Z ' +
  // J — stem
  'M57 34 H64 V52 A10 10 0 0 1 54 62 H51 V55 H53.5 A3.5 3.5 0 0 0 57 51.5 Z ' +
  // nova spark — four-point star
  'M48 12 L50.6 17.4 L56 20 L50.6 22.6 L48 28 L45.4 22.6 L40 20 L45.4 17.4 Z'

function fillFor(variant: NovaLogoVariant, id: string): { def: string; fill: string } {
  switch (variant) {
    case 'solid':
      return { def: '', fill: '#7C3AED' }
    case 'mono-light':
      return { def: '', fill: '#F5F3FF' }
    case 'mono-dark':
      return { def: '', fill: '#0B0712' }
    default:
      return {
        def: (
          `<linearGradient id="${id}" x1="20" y1="6" x2="76" y2="90" gradientUnits="userSpaceOnUse">` +
          '<stop offset="0" stop-color="#C084FC"/>' +
          '<stop offset="0.55" stop-color="#8B5CF6"/>' +
          '<stop offset="1" stop-color="#6D28D9"/>' +
          '</linearGradient>'
        ),
        fill: `url(#${id})`,
      }
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
  const id = `nova-g${++uid}`
  const { def, fill } = fillFor(variant, id)
  const labelled = !decorative && title !== ''
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 96 96"
      role={labelled ? 'img' : 'presentation'}
      aria-hidden={labelled ? undefined : true}
      aria-label={labelled ? title : undefined}
    >
      {def !== '' ? <defs dangerouslySetInnerHTML={{ __html: def }} /> : null}
      <path d={`${DIAMOND} ${COUNTER}`} fill={fill} fillRule="evenodd" />
    </svg>
  )
}
