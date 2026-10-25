import RAPIER from '@dimforge/rapier3d-compat'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { PHYSICS_TIMESTEP } from '../constants/physics'
import { createMemorySink } from '../logging/eventSink'
import { createRunLog, installRunLog, uninstallRunLog } from '../logging/runLog'
import { resetGameStore } from '../store/gameStore'
import { withDriveReaching } from '../systems/authority/driveRigFixtures'
import { buildIntent } from '../systems/input/buildIntent'
import type { Vector2 } from '../systems/vehicle/localFrame'
import { casingAlongPath, type LegCasing } from './casingLegFixtures'
import { createRig } from './cutFollowFixtures'

// Casing along a dug leg (the TD's release check on #662, Systems' casing row on #661): off planet
// 1's pad and still on its surface, a rig at drill purchase 1, 10 and 20 cuts down, then west, in
// the live loop with the swept cut on, and the bore wall's rock within the casing ring's reach of
// its path is read (`casingLegFixtures.ts`). Down: no run of unlined wall longer than one sample,
// and lined samples per metre at least 95% of main's (lining more than main, which leaves its own
// gaps, is no fault). West: no unlined run longer than main's worst. Main's numbers are this read
// of origin/main a94d74358 (protocol 109, #36's 1.9 m bore), the same legs.

interface CasingLeg {
  purchase: number
  downSeconds: number
  westSeconds: number
}

const LEGS: readonly CasingLeg[] = [
  { purchase: 1, downSeconds: 6, westSeconds: 8 },
  { purchase: 10, downSeconds: 3, westSeconds: 3 },
  { purchase: 20, downSeconds: 2, westSeconds: 3 },
]

/** Off the pad on the surface: a longer drive's level cut bites into the hill west of it. */
const OFF_PAD_SECONDS = 1.1
/** Back east a second after the west leg, so its last rings fall due behind the stamp. */
const BACK_OUT_SECONDS = 1
/** A drive that keeps up with purchase 10's 10.7 m/s on a sideways cut (Bjor's ruling on #723). */
const WEST_DRIVE_MPS = 10.7
const HOLD_NEVER_FULL = 60

/** Main's read of the same legs, by purchase. */
const MAIN_DOWN: Readonly<Record<number, LegCasing>> = {
  1: { lengthM: 4.9, linedPerMetre: 9.17, worstUnlinedRun: 2 },
  10: { lengthM: 20.4, linedPerMetre: 8.59, worstUnlinedRun: 0 },
  20: { lengthM: 17.2, linedPerMetre: 7.54, worstUnlinedRun: 13 },
}
const MAIN_WEST_WORST_RUN: Readonly<Record<number, number>> = { 1: 3, 10: 39, 20: 2 }

const LINED_SHARE_OF_MAIN_MIN = 0.95
const UNLINED_RUN_MAX = 1

beforeAll(async () => {
  await RAPIER.init()
})

beforeEach(() => {
  resetGameStore()
  installRunLog(
    createRunLog({ runId: 'casing', sink: createMemorySink(), secondsSinceStart: () => 0 }),
  )
})

afterEach(() => uninstallRunLog())

const ticks = (seconds: number) => Math.round(seconds / PHYSICS_TIMESTEP)
const pathOf = (reads: readonly { position: Vector2 }[]) => reads.map((read) => read.position)

const dug = new Map<CasingLeg, { down: LegCasing; west: LegCasing }>()

/** The leg dug once, its casing read after it backs out, shared by the rows that judge it. */
function casingOf(leg: CasingLeg): { down: LegCasing; west: LegCasing } {
  const known = dug.get(leg)
  if (known !== undefined) return known
  const levels = { drill_power: leg.purchase, cargo_hold: HOLD_NEVER_FULL }
  const rig = createRig(RAPIER, withDriveReaching(levels, WEST_DRIVE_MPS), 60)
  rig.hold(buildIntent(['aim_left']), ticks(OFF_PAD_SECONDS))
  const down = pathOf(rig.hold(buildIntent(['aim_down']), ticks(leg.downSeconds)))
  const west = pathOf(rig.hold(buildIntent(['aim_left']), ticks(leg.westSeconds)))
  rig.hold(buildIntent(['aim_right']), ticks(BACK_OUT_SECONDS))
  const read = { down: casingAlongPath(down), west: casingAlongPath(west) }
  dug.set(leg, read)
  return read
}

describe('casing along a dug leg (TD release check on #662)', () => {
  it.each(LEGS)(
    'lines the down leg at purchase $purchase with no unlined run past a sample, as densely as main',
    (leg) => {
      const { down } = casingOf(leg)
      console.log(`purchase ${leg.purchase} down`, JSON.stringify(down))
      expect(down.worstUnlinedRun).toBeLessThanOrEqual(UNLINED_RUN_MAX)
      const floor = MAIN_DOWN[leg.purchase].linedPerMetre * LINED_SHARE_OF_MAIN_MIN
      expect(down.linedPerMetre).toBeGreaterThanOrEqual(floor)
    },
    600_000,
  )

  it.each(LEGS)(
    'leaves the west leg at purchase $purchase no unlined run longer than main’s',
    (leg) => {
      const { west } = casingOf(leg)
      console.log(`purchase ${leg.purchase} west`, JSON.stringify(west))
      expect(west.worstUnlinedRun).toBeLessThanOrEqual(MAIN_WEST_WORST_RUN[leg.purchase])
    },
    600_000,
  )
})
