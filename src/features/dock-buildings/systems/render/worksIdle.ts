/**
 * The Engineering Works' idle life (ticket 395, the hangar that replaced the #174 hall): the
 * turntable turns slowly while no car stands on it, the gantry arm sways about its root bearing,
 * and the stacks vent steam. The numbers are `worksIdle.json` beside the slice, tuned by eye on the
 * review renders; presentation only, read from render seconds, never from the authority state.
 */
import IDLE_FILE from '../../worksIdle.json'

const TURN = 2 * Math.PI

export interface TurntableIdle {
  /** One full turn while idle. */
  secondsPerTurn: number
  /** How quickly the turn eases to its idle speed, or to a stop under a docked car. */
  easeSeconds: number
  /** The rim's art repeats every this many degrees (a lamp, then a seam): the art's own period. */
  rimPeriodDegrees: number
  /** Vertical strips the band is drawn in, so the cylinder's remap stays smooth. */
  bandColumns: number
}

export interface GantryIdle {
  swayRadians: number
  swaySeconds: number
}

/** One stack mouth, placed from `workshop.stack` (the tallest stack's top) by `offsetM`. */
export interface SteamVent {
  offsetM: readonly [number, number]
  /** The way the steam leaves, not yet unit length. */
  dir: readonly [number, number]
  perSecond: number
  speed: number
  spreadRadians: number
  lifeSeconds: number
  /** A puff cycle's length, or 0 for a steady plume. */
  puffSeconds: number
  /** The share of each cycle the vent blows. */
  puffShare: number
}

export interface SteamLook {
  capacity: number
  seed: number
  colour: string
  sizePixels: number
  opacity: number
  vents: readonly SteamVent[]
}

export interface WorksIdle {
  turntable: TurntableIdle
  gantry: GantryIdle
  steam: SteamLook
}

export const WORKS_IDLE: WorksIdle = readWorksIdle(IDLE_FILE)

/** The gantry arm's turn about its root bearing: a slow sine either side of the authored pose. */
export function gantrySwayAt(seconds: number, gantry: GantryIdle = WORKS_IDLE.gantry): number {
  return gantry.swayRadians * Math.sin((TURN * seconds) / gantry.swaySeconds)
}

type IdleFile = typeof IDLE_FILE
type VentRow = IdleFile['steam']['vents'][number]

/** The file refused whole (every problem listed) rather than trimmed. */
function readWorksIdle(file: IdleFile): WorksIdle {
  const problems = [...turntableProblems(file.turntable), ...steamProblems(file.steam)]
  if (problems.length > 0) throw new Error(`worksIdle.json: ${problems.join('; ')}`)
  return { ...file, steam: { ...file.steam, vents: file.steam.vents.map(ventOf) } }
}

function ventOf(row: VentRow): SteamVent {
  return { ...row, offsetM: pairOf(row.offsetM), dir: pairOf(row.dir) }
}

function pairOf(values: readonly number[]): [number, number] {
  return [values[0], values[1]]
}

function turntableProblems(turntable: TurntableIdle): string[] {
  const positive = [turntable.secondsPerTurn, turntable.easeSeconds, turntable.rimPeriodDegrees]
  return [
    ...unless(positive.every(isPositive), 'turntable times and period must be positive'),
    ...unless(turntable.bandColumns >= 1, 'the turntable band needs at least one column'),
  ]
}

function steamProblems(steam: IdleFile['steam']): string[] {
  return [
    ...unless(steam.vents.length > 0, 'the stacks need at least one vent'),
    ...steam.vents.flatMap(ventProblems),
  ]
}

function ventProblems(vent: VentRow, index: number): string[] {
  return [
    ...unless(vent.offsetM.length === 2 && vent.dir.length === 2, `vent ${index} needs x, y pairs`),
    ...unless(isPositive(Math.hypot(...vent.dir)), `vent ${index} blows nowhere`),
  ]
}

function isPositive(value: number): boolean {
  return value > 0
}

function unless(isFine: boolean, problem: string): string[] {
  return isFine ? [] : [problem]
}
