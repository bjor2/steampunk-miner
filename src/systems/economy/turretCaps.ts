/**
 * The kernel's caps on a turret shape (ticket 382, the TD lock on #319), `gun.turretCaps` in
 * economy.json, from Systems' auto_guns table on #322 section 6:
 *
 * - `gunRangeCap` (10 tiles): Extended barrels' last range Mark, up from `gun.rangeTiles` 8 (TD
 *   6048623615), so every turret target is on screen zoomed out.
 * - `energyPerShotFloor` (0.250 units): the barrels' past-cap stat, `energy.perShot` 0.500 x0.92 a
 *   Mark, stops at the general 0.5 floor.
 * - `maxGrapeTargets` (5): grapeshot's Mastered targets, within `maxActivePerVehicle` 6.
 * - `maxKnockCells` (4): concussion's Mastered push.
 * - `maxBounceLegCells` (6): ricochet's Mastered bounce leg.
 * - `maxPretrainTicks` (8): the longest a spotter's pre-train holds a due shot for a surfacing
 *   burrower (K-pretrain, ticket 413; GD ruling 6180873822 on #320: "a few ticks", a placeholder
 *   Systems confirms before the spotter guns combo unholds).
 *
 * The auto_guns modules (#388) fold their asks into one shape; the kernel checks it against these.
 */
import type { Money } from '../money'
import type { FieldReader } from './economyFieldReader'

export interface TurretCaps {
  gunRangeCap: number
  energyPerShotFloor: Money
  maxGrapeTargets: number
  maxKnockCells: number
  maxBounceLegCells: number
  maxPretrainTicks: number
}

export function readTurretCaps(reader: FieldReader, value: unknown): TurretCaps {
  const caps = reader.object('gun.turretCaps', value)
  const whole = (field: string) => reader.safeInteger(`gun.turretCaps.${field}`, caps[field])
  const read: TurretCaps = {
    gunRangeCap: whole('gunRangeCap'),
    energyPerShotFloor: reader.money('gun.turretCaps.energyPerShotFloor', caps.energyPerShotFloor),
    maxGrapeTargets: whole('maxGrapeTargets'),
    maxKnockCells: whole('maxKnockCells'),
    maxBounceLegCells: whole('maxBounceLegCells'),
    maxPretrainTicks: whole('maxPretrainTicks'),
  }
  recordOutOfRange(reader, read)
  return read
}

function recordOutOfRange(reader: FieldReader, caps: TurretCaps): void {
  const counts: Exclude<keyof TurretCaps, 'energyPerShotFloor'>[] = [
    'gunRangeCap',
    'maxGrapeTargets',
    'maxKnockCells',
    'maxBounceLegCells',
    'maxPretrainTicks',
  ]
  counts
    .filter((field) => caps[field] < 1)
    .forEach((field) => reader.record(`gun.turretCaps.${field} must be 1 or more`))
}
