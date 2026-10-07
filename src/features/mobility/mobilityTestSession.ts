/**
 * Spec plumbing for the mobility lane, on the loaded slices: a planet-1 session with mobility
 * items slotted, a cavity carved underground to grapple in, and pose reports at chosen millimetre
 * points, set up through `debug.*` commands like a start scenario. Only specs use it.
 */
import type { AuthorityCommand, CommandIntent } from '../../systems/authority/authorityCommand'
import type { DomainEvent } from '../../systems/authority/domainEvent'
import { carveCircleCommand } from '../../systems/authority/groundCommands'
import { setVehicleLoadoutCommand } from '../../systems/authority/loadoutCommands'
import {
  createScriptedSession,
  GROUND,
  poseAbove,
  type ScriptedSession,
} from '../../systems/authority/scriptedSession'
import { FACING, type Facing } from '../../systems/vehicle/vehiclePose'
import { SOLID_DENSITY } from '../../systems/world/sampleGrid'
import { intentToUseSlot, type PowerUpSlot } from '../power-up-core'

export const MM = 1000

/** A cavity ten tiles under the surface column the scripted specs drive on. */
export const CAVITY = { x: GROUND.tx * MM + MM / 2, y: (GROUND.ty - 10) * MM + MM / 2 }

/** Its radius: the roof sits about three tiles above its centre. */
export const CAVITY_RADIUS_MM = 2600

export const press = (slot: PowerUpSlot = 'powerup.1') => intentToUseSlot(slot)

export const ofType = (events: readonly DomainEvent[], type: string) =>
  events.filter((event) => event.type === type)

/** A session at tick 1 with `slots` filled (owning each item), standing on the surface. */
export function sessionWith(
  slots: Readonly<Record<string, string>>,
  facing: Facing = FACING.right,
): ScriptedSession {
  const session = createScriptedSession()
  session.submit(0, setVehicleLoadoutCommand(slots))
  session.submit(1, poseAbove(GROUND, facing))
  return session
}

/** A scripted session that keeps the commands it was given, so a spec can replay them. */
export interface RecordedSession extends ScriptedSession {
  commands: readonly AuthorityCommand[]
}

/** As `sessionWith`, recording every command from the loadout on. */
export function recordedSessionWith(
  slots: Readonly<Record<string, string>>,
  facing: Facing = FACING.right,
): RecordedSession {
  const session = createScriptedSession()
  const commands: AuthorityCommand[] = []
  const submit = (tick: number, intent: CommandIntent) => {
    commands.push({ playerId: 'p1', tick, seq: commands.length + 1, ...intent } as AuthorityCommand)
    return session.submit(tick, intent)
  }
  const recorded = { ...session, submit, commands }
  recorded.submit(0, setVehicleLoadoutCommand(slots))
  recorded.submit(1, poseAbove(GROUND, facing))
  return recorded
}

/** Carves the cavity and reports the miner at rest at its centre, facing `facing`. */
export function standInCavity(session: ScriptedSession, tick: number, facing: Facing): void {
  session.submit(
    tick,
    carveCircleCommand({ ...CAVITY, radius: CAVITY_RADIUS_MM, amount: SOLID_DENSITY }),
  )
  session.submit(tick, poseAt(CAVITY.x, CAVITY.y, facing))
}

/** A pose report at a millimetre point, upright at the planet's top, with optional motion. */
export function poseAt(
  x: number,
  y: number,
  facing: Facing,
  motion: { vx?: number; vy?: number; thrustTicks?: number; driveTicks?: number } = {},
): CommandIntent<'reportPose'> {
  const { payload } = poseAbove(GROUND, facing)
  return {
    type: 'reportPose',
    payload: {
      ...payload,
      x,
      y,
      vx: motion.vx ?? 0,
      vy: motion.vy ?? 0,
      thrustTicks: motion.thrustTicks ?? 0,
      driveTicks: motion.driveTicks ?? 0,
    },
  }
}
