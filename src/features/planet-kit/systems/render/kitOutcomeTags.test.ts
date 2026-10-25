import { describe, expect, it } from 'vitest'
import type { CommandIntent } from '../../../../systems/authority/authorityCommand'
import type { DomainEvent } from '../../../../systems/authority/domainEvent'
import { placeHazardCommand } from '../../../../systems/authority/hazards/hazardDebugRules'
import {
  createScriptedSession,
  GROUND,
  mineTile,
  poseAbove,
} from '../../../../systems/authority/scriptedSession'
import { FACING } from '../../../../systems/vehicle/vehiclePose'
import { UNCORK_FLASK_INTENT } from '../flaskRules'
import {
  HEARD_OUTCOMES_KEPT,
  heardOutcomesOf,
  kitOutcomeTagsOf,
  OUTCOME_TAG_TICKS,
  withHeardOutcomes,
  type HeardOutcome,
} from './kitOutcomeTags'

// The hazard tools' outcomes as overlay tags (ticket 882, "each outcome reads on screen"): a tag
// over the cell each outcome acted on for 90 ticks from its event, and one over each open flask's
// cleared firedamp for as long as it is open.

const START = 100
const BELOW = { tx: GROUND.tx, ty: GROUND.ty - 1 }

const grantKitItem = (itemId: string): CommandIntent =>
  ({ type: 'debug.planet-kit.grantKitItem', payload: { itemId } }) as CommandIntent

const OUTCOMES: DomainEvent[] = [
  {
    tick: 7,
    type: 'planet-kit.ScreeShoved',
    playerId: 'p1',
    fromTx: 3,
    fromTy: 4,
    toTx: 4,
    toTy: 4,
  },
  { tick: 8, type: 'planet-kit.ShardLooted', playerId: 'p1', tx: 3, ty: 3 },
  {
    tick: 9,
    type: 'planet-kit.VaneRidden',
    playerId: 'p1',
    tx: 4,
    ty: 2,
    tiles: 1,
    toTx: 3,
    toTy: 3,
  },
  { tick: 9, type: 'GroundChanged', cx: 0, cy: 0, x0: 0, y0: 0, x1: 1, y1: 1 } as DomainEvent,
]

describe('kit outcome tags', () => {
  it('hears a shove at the open cell, a loot at its cell and a ride where it ends, and nothing else', () => {
    expect(heardOutcomesOf(OUTCOMES)).toEqual([
      { verb: 'scree_shoved', cell: { tx: 4, ty: 4 }, tick: 7 },
      { verb: 'shard_looted', cell: { tx: 3, ty: 3 }, tick: 8 },
      { verb: 'vane_ride', cell: { tx: 3, ty: 3 }, tick: 9 },
    ])
  })

  it('shows an outcome’s tag for 90 ticks from its event', () => {
    const session = createScriptedSession()
    session.submit(START, grantKitItem('shard_tongs'))
    session.submit(START, placeHazardCommand('spinecrystal', GROUND.tx, GROUND.ty))
    const heard = heardOutcomesOf(mineTile(session, START + 1, GROUND))
    const lootTick = heard[0].tick
    expect(kitOutcomeTagsOf(heard, session.state())).toMatchObject([
      { verb: 'shard_looted', label: 'Shard looted', cell: GROUND },
    ])
    session.submit(lootTick + OUTCOME_TAG_TICKS, poseAbove(GROUND, FACING.down))
    expect(kitOutcomeTagsOf(heard, session.state())).toEqual([])
  })

  it('shows an open flask’s cleared firedamp at its uncork cell until it closes', () => {
    const session = createScriptedSession()
    session.submit(START, grantKitItem('damp_flask'))
    session.submit(START + 1, poseAbove({ tx: BELOW.tx, ty: BELOW.ty - 1 }, FACING.down))
    session.submit(START + 2, UNCORK_FLASK_INTENT)
    expect(kitOutcomeTagsOf([], session.state())).toMatchObject([
      { verb: 'firedamp_cleared', label: 'Firedamp cleared', cell: BELOW },
    ])
    session.submit(START + 2 + 3600, poseAbove({ tx: BELOW.tx, ty: BELOW.ty - 1 }, FACING.down))
    expect(kitOutcomeTagsOf([], session.state())).toEqual([])
  })

  it('keeps only the newest outcomes heard', () => {
    const one: HeardOutcome = { verb: 'shard_looted', cell: { tx: 0, ty: 0 }, tick: 1 }
    const many = Array.from({ length: HEARD_OUTCOMES_KEPT + 3 }, (_, at) => ({ ...one, tick: at }))
    const kept = withHeardOutcomes([], many)
    expect(kept).toHaveLength(HEARD_OUTCOMES_KEPT)
    expect(kept[0].tick).toBe(3)
  })
})
