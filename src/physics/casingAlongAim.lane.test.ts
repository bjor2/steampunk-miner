import RAPIER from '@dimforge/rapier3d-compat'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { PHYSICS_TIMESTEP } from '../constants/physics'
import { createMemorySink, type MemorySink } from '../logging/eventSink'
import type { RunEvent } from '../logging/runEvent'
import { createRunLog, installRunLog, uninstallRunLog } from '../logging/runLog'
import { resetGameStore } from '../store/gameStore'
import { withDriveReaching } from '../systems/authority/driveRigFixtures'
import { intentOfStick, stickDriveOf } from '../systems/input/analogStick'
import { buildIntent } from '../systems/input/buildIntent'
import { aimDirectionOf, type Aim } from '../systems/vehicle/aim'
import type { VehicleIntent } from '../systems/vehicle/vehicleIntent'
import { SAMPLES_PER_TILE } from '../systems/world/sampleGrid'
import { casingAlongPath, type LegCasing } from './casingLegFixtures'
import { createRig } from './cutFollowFixtures'

// The casing ring follows the cut's aim (ticket 833, its done-when goldens): off planet 1's pad, a
// rig at drill purchase 1, 10 and 20 digs one leg with the stick at its rim, straight down, at 45
// degrees down-left and 5/64 turn off straight down, in the live loop with the swept cut on. The
// wall's rock within a sample past the ring's reach along that aim is read
// (`casingLegFixtures.ts`), so the 45 degree wall is read out past its 0.787 m: no unlined run
// longer than one cell along either wall, the ticket's bar (4 samples along it; the first read,
// 2026-10-25, found at most 2, at the shaft's mouth). Dig pace is unchanged at every aim (the G&V
// feel bar): the ring moves the cut only through lining the drill meets, so an aimed leg meets no
// more of it than the straight-down leg at the same purchase, whose rings are #662's to the byte.

interface AimedLeg {
  purchase: number
  seconds: number
  name: string
  aim: Aim
}

const STRAIGHT_DOWN: Aim = 48
/** The casing-per-metre lane's down legs, by purchase. */
const LEG_SECONDS: Readonly<Record<number, number>> = { 1: 6, 10: 3, 20: 2 }
const AIMS: readonly { name: string; aim: Aim }[] = [
  { name: 'straight down', aim: STRAIGHT_DOWN },
  { name: 'at 45 degrees', aim: 40 },
  { name: '5/64 turn off straight down', aim: 43 },
]
const LEGS: readonly AimedLeg[] = [1, 10, 20].flatMap((purchase) =>
  AIMS.map(({ name, aim }) => ({ purchase, seconds: LEG_SECONDS[purchase], name, aim })),
)

/** Off the pad on the surface, as the casing-per-metre lane leaves it. */
const OFF_PAD_SECONDS = 1.1
/** A drive that keeps up with purchase 10's 10.7 m/s on a sideways cut (Bjor's ruling on #723). */
const DRIVE_MPS = 10.7
const HOLD_NEVER_FULL = 60
/** One cell along the wall: the ticket's largest unlined run. */
const UNLINED_RUN_MAX = SAMPLES_PER_TILE
/** A leg shorter than this read nothing between its first 2 m and its last 3 m worth judging. */
const LEG_READ_MIN_M = 1

let sink: MemorySink

beforeAll(async () => {
  await RAPIER.init()
})

beforeEach(() => {
  resetGameStore()
  sink = createMemorySink()
  installRunLog(createRunLog({ runId: 'casing-aim', sink, secondsSinceStart: () => 0 }))
})

afterEach(() => uninstallRunLog())

const ticks = (seconds: number) => Math.round(seconds / PHYSICS_TIMESTEP)

/** The stick at its rim along `aim`: the drive and lift the touch stick and the pad give it. */
function stickAlong(aim: Aim): VehicleIntent {
  const { along, up } = aimDirectionOf(aim)
  const drive = stickDriveOf({ x: along / 1024, y: up / 1024 }, 0, null)
  if (drive === null) throw new Error(`no drive at aim ${aim}`)
  return intentOfStick(drive)
}

interface DugLeg {
  casing: LegCasing
  /** Lining samples the drill cut on the leg (`casing_drilled`). */
  liningDrilled: number
}

const dug = new Map<string, DugLeg>()

/** The leg dug once, shared by the rows that read it. */
function dugLeg(purchase: number, aim: Aim): DugLeg {
  const key = `${purchase}@${aim}`
  const known = dug.get(key)
  if (known !== undefined) return known
  const read = digLeg(purchase, aim)
  dug.set(key, read)
  return read
}

function digLeg(purchase: number, aim: Aim): DugLeg {
  const levels = { drill_power: purchase, cargo_hold: HOLD_NEVER_FULL }
  const rig = createRig(RAPIER, withDriveReaching(levels, DRIVE_MPS), 60)
  rig.hold(buildIntent(['aim_left']), ticks(OFF_PAD_SECONDS))
  const before = sink.events.length
  const path = rig.hold(stickAlong(aim), ticks(LEG_SECONDS[purchase])).map((read) => read.position)
  return { casing: casingAlongPath(path, aim), liningDrilled: liningDrilledIn(sink, before) }
}

function liningDrilledIn(log: MemorySink, from: number): number {
  return log.events
    .slice(from)
    .filter(isLiningDrilled)
    .reduce((sum, event) => sum + event.data.samples, 0)
}

function isLiningDrilled(event: RunEvent): event is RunEvent<'casing_drilled'> {
  return event.event === 'casing_drilled'
}

describe('casing along the cut’s aim (ticket 833)', () => {
  it.each(LEGS)(
    'lines both walls of a leg $name at purchase $purchase with no unlined run past a cell',
    ({ purchase, aim }) => {
      const { casing } = dugLeg(purchase, aim)
      console.log(`purchase ${purchase} aim ${aim}`, JSON.stringify(casing))
      expect(casing.lengthM).toBeGreaterThanOrEqual(LEG_READ_MIN_M)
      expect(casing.worstUnlinedRun).toBeLessThanOrEqual(UNLINED_RUN_MAX)
    },
    600_000,
  )

  it.each(LEGS.filter(({ aim }) => aim !== STRAIGHT_DOWN))(
    'meets no more lining on a leg $name at purchase $purchase than straight down',
    ({ purchase, aim }) => {
      const aimed = dugLeg(purchase, aim).liningDrilled
      const straight = dugLeg(purchase, STRAIGHT_DOWN).liningDrilled
      console.log(`purchase ${purchase} aim ${aim} lining drilled`, aimed, 'straight', straight)
      expect(aimed).toBeLessThanOrEqual(straight)
    },
    600_000,
  )
})
