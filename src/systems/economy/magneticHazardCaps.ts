/**
 * The kernel's caps on `hazard:magnetic` (GD lock on spec #258 Q2, ticket 290), the
 * `magneticHazard` block in economy.json. Each is a share of an on-curve track at the planet, so
 * the hazard costs the same share of a run on every magnetic planet (`magneticHazard.ts`):
 *
 * - `tugShareOfEngineBp` (1000): a field tugs the rig toward its vein at 10% of the on-curve
 *   engine's top speed, and never past the #233 motion cap.
 * - `sensingReachShareBp` (5000): sensing inside a field reaches at least half its base.
 * - `shockTicks`: an electrified cell takes this many ticks longer to drill, the shock's time.
 * - `shockHullShareBp` (200): one shock costs at most 2% of the on-curve hull.
 * - `diveHullCapBp` (2500): all the shocks of one dive cost at most 25% of it, so the hazard
 *   never ends a run on its own.
 *
 * The hazard costs time and hull, never a bill: the hull is mended at the existing repair price.
 */
import { BASIS_POINTS } from '../../constants/balance'
import type { FieldReader } from './economyFieldReader'

export interface MagneticHazardCaps {
  tugShareOfEngineBp: number
  sensingReachShareBp: number
  shockTicks: number
  shockHullShareBp: number
  diveHullCapBp: number
}

const SHARES = [
  'tugShareOfEngineBp',
  'sensingReachShareBp',
  'shockHullShareBp',
  'diveHullCapBp',
] as const

export function readMagneticHazardCaps(reader: FieldReader, value: unknown): MagneticHazardCaps {
  const caps = reader.object('magneticHazard', value)
  const whole = (field: string) => reader.safeInteger(`magneticHazard.${field}`, caps[field])
  const read: MagneticHazardCaps = {
    tugShareOfEngineBp: whole('tugShareOfEngineBp'),
    sensingReachShareBp: whole('sensingReachShareBp'),
    shockTicks: whole('shockTicks'),
    shockHullShareBp: whole('shockHullShareBp'),
    diveHullCapBp: whole('diveHullCapBp'),
  }
  recordOutOfRange(reader, read)
  return read
}

function recordOutOfRange(reader: FieldReader, caps: MagneticHazardCaps): void {
  SHARES.filter((field) => !isShare(caps[field])).forEach((field) =>
    reader.record(`magneticHazard.${field} must be between 0 and ${BASIS_POINTS}`),
  )
  if (caps.shockTicks < 0) reader.record('magneticHazard.shockTicks must be 0 or more')
  if (caps.shockHullShareBp > caps.diveHullCapBp) {
    reader.record('magneticHazard.shockHullShareBp must not pass diveHullCapBp')
  }
}

function isShare(points: number): boolean {
  return points >= 0 && points <= BASIS_POINTS
}
