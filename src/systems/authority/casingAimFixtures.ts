/**
 * The aimed legs the ticket 833 casing specs share: rock 12 m under the surface east of the pad
 * (`START`), a strong drill and a grade that holds every band the leg crosses, enemies frozen and
 * the tank refilled as the dig goes. A leg is cut by swept drill steps along one aim, or by pose
 * reports at a fixed spacing, then backed out so every waiting ring falls due.
 */
import { aimFieldsOf, aimVectorOf, type Aim } from '../vehicle/aim'
import type { DomainEvent } from './domainEvent'
import { START } from './casingDigFixtures'
import {
  createScriptedSession,
  FREEZE_ENEMIES,
  GROUND,
  poseAbove,
  type ScriptedSession,
} from './scriptedSession'
import { stepBoundsAt } from './stepBoundRead'

export const DOWN: Aim = 48
export const DOWN_RIGHT: Aim = 56
/** Five steps of 1/64 turn off straight down, toward the right: the off-axis aim. */
export const OFF_AXIS: Aim = 53
export const LEG_MM = 10_000
/** Under the drill's pace through this rock at drill power 12, so the body never outruns its cut. */
const STEP_MM = 30
const REFILL_TICKS = 20
const BACK_OUT_STEP_MM = 100
const REPORT_TICKS = 12
/** A grade that holds every band the leg crosses, so no weak wall collapses into the shaft. */
const CASING_GRADE = 5

export interface MmPoint {
  xMm: number
  yMm: number
}

/** The point `alongMm` from START along `aim`. */
export function pointAlong(aim: Aim, alongMm: number): MmPoint {
  const ahead = aimVectorOf(0, 1024, aim)
  return {
    xMm: START.x + Math.round((ahead.x * alongMm) / 1024),
    yMm: START.y + Math.round((ahead.y * alongMm) / 1024),
  }
}

/** A pose report at `at` aimed at `aim`, with `drillTicks` of drilling since the last. */
function poseAt(at: MmPoint, aim: Aim, drillTicks: number) {
  const { payload } = poseAbove(GROUND, 1)
  return {
    type: 'reportPose' as const,
    payload: {
      ...payload,
      ...aimFieldsOf(aim),
      x: at.xMm,
      y: at.yMm,
      drilling: drillTicks > 0,
      drillTicks,
    },
  }
}

function refill(session: ScriptedSession, tick: number) {
  session.submit(tick, { type: 'debug.setEnergy', payload: { energy: '150' } })
}

/** A strong drill and a strong casing grade reported at START, aimed at `aim`. */
function strongSessionAt(aim: Aim, grade = CASING_GRADE): ScriptedSession {
  const session = createScriptedSession()
  session.submit(0, FREEZE_ENEMIES)
  session.submit(0, { type: 'debug.setUpgrade', payload: { upgradeId: 'drill_power', level: 12 } })
  session.submit(0, { type: 'debug.setMoney', payload: { amount: '1000' } })
  session.submit(0, { type: 'debug.setCasingGrade', payload: { grade } })
  refill(session, 0)
  session.submit(0, poseAt(pointAlong(aim, 0), aim, 0))
  return session
}

/** Backs out along the leg from its end to START, so every ring waiting falls due. */
export function backOut(session: ScriptedSession, aim: Aim, firstTick: number): number {
  let tick = firstTick
  for (let alongMm = LEG_MM; alongMm >= 0; alongMm -= BACK_OUT_STEP_MM) {
    tick += REPORT_TICKS
    refill(session, tick)
    session.submit(tick, poseAt(pointAlong(aim, alongMm), aim, 0))
  }
  return tick
}

/** A swept cut a drill step a tick along `aim` for the leg; `end` is its last tick. */
export function cutSweptLegAlong(
  aim: Aim,
  grade = CASING_GRADE,
): { session: ScriptedSession; end: number } {
  const session = strongSessionAt(aim, grade)
  const stepMm = Math.min(STEP_MM, stepBoundsAt(session.state(), 'p1').cuttingMm)
  const end = Math.ceil(LEG_MM / stepMm)
  for (let tick = 1; tick <= end; tick++) {
    if (tick % REFILL_TICKS === 0) refill(session, tick)
    const at = pointAlong(aim, Math.min(LEG_MM, tick * stepMm))
    const payload = { x: at.xMm, y: at.yMm, ...aimFieldsOf(aim), drive: { x: 0, y: -1 } as const }
    session.submit(tick, { type: 'drillStep', payload })
  }
  return { session, end }
}

/** The swept leg along `aim`, then backing out. */
export function sweptLegAlong(aim: Aim, grade = CASING_GRADE): ScriptedSession {
  const { session, end } = cutSweptLegAlong(aim, grade)
  backOut(session, aim, end)
  return session
}

/** Pose reports every `spacingMm` along `aim` for the leg, drilling as long a metre either way. */
export function reportedLegAlong(aim: Aim, spacingMm: number): ScriptedSession {
  const session = strongSessionAt(aim)
  const ticks = (REPORT_TICKS * spacingMm) / BACK_OUT_STEP_MM
  let tick = 0
  for (let alongMm = 0; alongMm <= LEG_MM; alongMm += spacingMm) {
    tick += ticks
    refill(session, tick)
    session.submit(tick, poseAt(pointAlong(aim, alongMm), aim, ticks))
  }
  backOut(session, aim, tick)
  return session
}

/** The tunnel axis every `CasingLined` among `events` billed, mm. */
export function chargedLengthMmOf(events: readonly DomainEvent[]): number {
  return events.reduce(
    (sum, event) => (event.type === 'CasingLined' ? sum + event.lengthMm : sum),
    0,
  )
}
