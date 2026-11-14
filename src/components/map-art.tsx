import { cn } from "cn"

/**
 * A drawn street map. It is decorative: the app has no geocoding, and pickup areas
 * are approximate by design, so the same seed (an area or listing id) always
 * produces the same made-up streets.
 */

function hash(text: string) {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619)
  return h >>> 0
}
function rng(seed: number) {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const n = (v: number) => Math.round(v * 10) / 10

const LAND = "#f1f0eb"
const BLOCK = "#e9e8e1"
const CASING = "#dddcd3"
const ROAD = "#ffffff"
const WATER = "#cddff0"
const PARK = "#d7e8cf"

export function MapArt({
  seed,
  label,
  wide = false,
  marker = true,
  className,
  children,
}: {
  seed: string
  /** Used for the accessible name, e.g. the pickup area. */
  label?: string
  /** A larger canvas with more streets, for big maps. */
  wide?: boolean
  /** Shows the approximate-area circle in the middle. */
  marker?: boolean
  className?: string
  children?: React.ReactNode
}) {
  const W = wide ? 1200 : 600
  const H = wide ? 600 : 300
  const rand = rng(hash(seed || "map"))
  const angle = n((rand() - 0.5) * 44)
  const reach = W * 0.9

  // Street grid, drawn in a rotated frame that overshoots the canvas.
  const xs: number[] = []
  for (let x = -reach / 2; x < W + reach / 2; x += 44 + rand() * 30) xs.push(n(x))
  const ys: number[] = []
  for (let y = -reach / 2; y < H + reach / 2; y += 40 + rand() * 26) ys.push(n(y))
  const majorX = xs.filter((_, i) => i % 4 === 1)
  const majorY = ys.filter((_, i) => i % 3 === 1)

  const cells: { x: number; y: number; w: number; h: number; fill: string }[] = []
  for (let i = 0; i < xs.length - 1; i++)
    for (let j = 0; j < ys.length - 1; j++) {
      const roll = rand()
      if (roll > 0.3) continue
      cells.push({ x: xs[i]! + 5, y: ys[j]! + 5, w: n(xs[i + 1]! - xs[i]! - 10), h: n(ys[j + 1]! - ys[j]! - 10), fill: roll < 0.07 ? PARK : BLOCK })
    }

  const river = rand() > 0.35
  const ry0 = n(H * (0.1 + rand() * 0.8))
  const ry1 = n(H * (0.1 + rand() * 0.8))
  const riverPath = `M-40 ${ry0}C${n(W * 0.3)} ${n(ry0 + (rand() - 0.5) * H * 0.7)} ${n(W * 0.65)} ${n(ry1 + (rand() - 0.5) * H * 0.7)} ${W + 40} ${ry1}`
  const avenue = `M${n(-40 + rand() * W * 0.3)} ${H + 40}L${n(W * 0.6 + rand() * W * 0.5)} -40`

  const lines = (stroke: string, minor: number, major: number) => (
    <>
      {xs.map((x) => (
        <path key={`x${x}`} d={`M${x} ${-reach}V${H + reach}`} stroke={stroke} strokeWidth={majorX.includes(x) ? major : minor} />
      ))}
      {ys.map((y) => (
        <path key={`y${y}`} d={`M${-reach} ${y}H${W + reach}`} stroke={stroke} strokeWidth={majorY.includes(y) ? major : minor} />
      ))}
    </>
  )

  return (
    <div
      role="img"
      aria-label={label ? `Map of the approximate pickup area, ${label}` : "Map of the approximate pickup area"}
      className={cn("relative overflow-hidden rounded-xl text-primary", className)}
      style={{ backgroundColor: LAND }}
    >
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" className="absolute inset-0 size-full" aria-hidden="true">
        <rect width={W} height={H} fill={LAND} />
        <g transform={`rotate(${angle} ${W / 2} ${H / 2})`}>
          {cells.map((c) => (
            <rect key={`${c.x},${c.y}`} x={c.x} y={c.y} width={c.w} height={c.h} rx="3" fill={c.fill} />
          ))}
        </g>
        {river && <path d={riverPath} fill="none" stroke={WATER} strokeWidth={wide ? 34 : 24} strokeLinecap="round" />}
        <g transform={`rotate(${angle} ${W / 2} ${H / 2})`} fill="none">
          {lines(CASING, 7, 12)}
          {lines(ROAD, 4.5, 9)}
        </g>
        <path d={avenue} fill="none" stroke={CASING} strokeWidth="13" />
        <path d={avenue} fill="none" stroke={ROAD} strokeWidth="10" />
        {marker && (
          <g>
            <circle cx={W / 2} cy={H / 2} r={wide ? 70 : 52} fill="currentColor" fillOpacity="0.08" stroke="currentColor" strokeOpacity="0.45" strokeWidth="1.5" strokeDasharray="5 5" />
            <circle cx={W / 2} cy={H / 2} r="7" fill="currentColor" stroke="#ffffff" strokeWidth="3" />
          </g>
        )}
      </svg>
      {children}
    </div>
  )
}
