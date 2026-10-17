import { describe, expect, it } from 'vitest'
import {
  BACK_MM,
  backOut,
  chargedLiningMmOf,
  cutBack,
  digForward,
  GRAZING_THE_WALL,
  IN_THE_BORE,
  linedWallOf,
  startReversal,
  STRAIGHT_DIG,
  type Reversal,
  type WayBack,
} from './casingReversalFixtures'
import { readSnapshot, takeSnapshot } from './sessionSnapshot'
import { stateDigest } from './stateDigest'
import {
  continueScriptedSession,
  createScriptedSession,
  type ScriptedSession,
} from './scriptedSession'

// A rig cutting back over its own trail, as a session (ticket 538, the TD ruling 6228998310 on
// #538): no ring laid under the stamp or inside the lag on the way back, no fresh lining drilled,
// and the VS's economy bars on the ground-read cells: the run lines the same wall as the plain
// dig and is billed the same, so every cell lined once is charged once and the charge per unique
// lined length is at most 1.000 x the plain dig's. The pure check of both trail functions is
// `vehicle/casingTrailReversal.test.ts`. A way back that grazes the wall is logged, not gated: it
// cuts new wall past lining already laid, and its points there sit on lined trail, not waiting
// trail, so the spacing rule keeps them and the rings bill again (a number for Systems).

function reverseOverTrail(wayBack: WayBack): Reversal {
  const session = createScriptedSession()
  startReversal(session)
  const dug = digForward(session)
  const before = session.events().length
  const back = cutBack(session, dug, wayBack)
  const wayBackEvents = session.events().slice(before)
  backOut(session, back.end, wayBack)
  return { session, rings: back.rings, wayBackEvents }
}

/** The test-only row (VS): charged lining against the unique lined length, to size a double charge. */
function logLiningRow(name: string, { session }: Reversal): void {
  const { uniqueLinedMm, cells } = linedWallOf(session)
  const chargedMm = chargedLiningMmOf(session)
  console.log(
    `${name}: charged ${chargedMm} mm against unique lined ${uniqueLinedMm} mm (${cells} cells)`,
  )
}

describe('casing of a rig cutting back over its own trail (#538)', () => {
  it('lays no ring under the stamp or inside the lag on the way back', () => {
    const { rings } = reverseOverTrail(IN_THE_BORE)
    expect(rings.laid).toBeGreaterThan(0)
    expect(rings.insideLag).toEqual([])
  })

  it('drills none of its own fresh lining on the way back', () => {
    const { wayBackEvents } = reverseOverTrail(IN_THE_BORE)
    expect(wayBackEvents.filter((event) => event.type === 'CasingDrilled')).toEqual([])
  })

  it('lines the same wall as the plain dig and is billed the same for it', () => {
    const straight = reverseOverTrail(STRAIGHT_DIG).session
    const reversed = reverseOverTrail(IN_THE_BORE).session
    expect(linedWallOf(reversed)).toEqual(linedWallOf(straight))
    expect(chargedLiningMmOf(reversed)).toBe(chargedLiningMmOf(straight))
  })

  it('charges at most 1.000 x the plain dig per unique lined length', () => {
    const perUnique = (run: Reversal) =>
      chargedLiningMmOf(run.session) / linedWallOf(run.session).uniqueLinedMm
    const straight = reverseOverTrail(STRAIGHT_DIG)
    const reversed = reverseOverTrail(IN_THE_BORE)
    logLiningRow('plain dig', straight)
    logLiningRow('cutting back in the bore', reversed)
    logLiningRow(
      'cutting back grazing the wall (logged, not gated)',
      reverseOverTrail(GRAZING_THE_WALL),
    )
    expect(perUnique(reversed)).toBeLessThanOrEqual(perUnique(straight))
  })

  it('reaches the same state on replay and from a snapshot taken on the way back', () => {
    const firstHalf = { ...IN_THE_BORE, backMm: BACK_MM / 2 }
    const secondHalf = { ...firstHalf, fromMm: IN_THE_BORE.fromMm - firstHalf.backMm }
    const runFrom = (session: ScriptedSession, tick: number) =>
      backOut(session, cutBack(session, tick, secondHalf).end, secondHalf)
    const halfWay = (session: ScriptedSession) => {
      startReversal(session)
      return cutBack(session, digForward(session), firstHalf).end
    }
    const unbroken = createScriptedSession()
    runFrom(unbroken, halfWay(unbroken))
    const saved = createScriptedSession()
    const savedAt = halfWay(saved)
    const restored = readSnapshot(JSON.parse(JSON.stringify(takeSnapshot(saved.state()))))
    if (!('state' in restored)) throw new Error('the snapshot taken on the way back was refused')
    const resumed = continueScriptedSession(restored.state)
    runFrom(resumed, savedAt)
    expect(saved.vehicle().casingTrail.unlined.length).toBeGreaterThan(0)
    expect(stateDigest(resumed.state())).toBe(stateDigest(unbroken.state()))
    expect(stateDigest(reverseOverTrail(IN_THE_BORE).session.state())).toBe(
      stateDigest(reverseOverTrail(IN_THE_BORE).session.state()),
    )
  })
})
