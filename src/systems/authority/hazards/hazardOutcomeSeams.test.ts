import { describe, expect, it } from 'vitest'
import { withRegistrations } from '../../../registries/registrar'
import type { SliceDefinition } from '../../../registries/sliceDefinition'
import type { ContactEffectRow } from '../../registries/contactEffects'
import type { HazardClear } from '../../registries/hazardClears'
import type { ShoveAim } from '../../registries/shoveAims'
import { FACING } from '../../vehicle/vehiclePose'
import type { DomainEvent } from '../domainEvent'
import { planetParamsOf } from '../planetOfState'
import {
  createScriptedSession,
  drill,
  GROUND,
  mineTile,
  poseAbove,
  type ScriptedSession,
} from '../scriptedSession'
import { hazardKindAtTile } from './hazardCells'
import { placeHazardCommand } from './hazardDebugRules'

// The kernel seams of the hazard tools' outcomes (ticket 882, PK4c T2): a shove aim turns a vent's
// shove outward from the core at the size its factor leaves (the Vent Vane), and a hazard clear
// holds a kind off cells, a flag and never a cell (the Damp Flask). Probe slices stand in for
// planet-kit, so no real slice is imported.

const START = 100
const BELOW = { tx: GROUND.tx, ty: GROUND.ty - 1 }
/** Beside the rig standing in BELOW, to its right. */
const SIDE_VENT = { tx: GROUND.tx + 1, ty: GROUND.ty - 1 }

const VENT_ROW: ContactEffectRow = {
  id: 'probe.steamvent',
  kind: 'steamvent',
  effect: 'shove',
  factorBp: 10000,
  diveHullCapBp: 2500,
  hullShareBp: 200,
  shoveTiles: 3,
  ticks: 20,
}

const DAMP_ROW: ContactEffectRow = {
  id: 'probe.firedamp',
  kind: 'firedamp',
  effect: 'drain',
  factorBp: 10000,
  diveHullCapBp: 2500,
  energyShareBp: 1500,
  ticks: 180,
  floorBp: 2500,
}

function eventsOfType<T extends DomainEvent['type']>(
  events: readonly DomainEvent[],
  type: T,
): Extract<DomainEvent, { type: T }>[] {
  return events.filter((event): event is Extract<DomainEvent, { type: T }> => event.type === type)
}

function probeSlice(
  extra: (r: Parameters<SliceDefinition['register']>[0]) => void,
): SliceDefinition {
  return {
    id: 'probe',
    register: (r) => {
      r.contactEffect(VENT_ROW)
      r.contactEffect(DAMP_ROW)
      extra(r)
    },
  }
}

/** GROUND and BELOW mined, then a vent beside the rig in BELOW cut from the side. */
function shoveFromSideVent(session: ScriptedSession): DomainEvent[] {
  mineTile(session, START, GROUND)
  mineTile(session, START + 50, BELOW)
  session.submit(START + 99, placeHazardCommand('steamvent', SIDE_VENT.tx, SIDE_VENT.ty))
  session.submit(START + 100, poseAbove({ tx: BELOW.tx, ty: BELOW.ty - 1 }, FACING.right))
  return session.submit(START + 140, drill(SIDE_VENT, 40))
}

describe('shove aims', () => {
  it('shoves along the vent normal with no aim: into the wall beside, so nowhere', () => {
    const [shove] = withRegistrations([probeSlice(() => {})], () =>
      eventsOfType(shoveFromSideVent(createScriptedSession()), 'HazardShoved'),
    )
    expect(shove).toMatchObject({ tiles: 0, toTx: BELOW.tx, toTy: BELOW.ty })
  })

  it('turns the shove outward from the core while an aim answers, at the same size', () => {
    const aim: ShoveAim = { id: 'probe.vane', kind: 'steamvent', isAimedOutward: () => true }
    const [shove] = withRegistrations([probeSlice((r) => r.shoveAim(aim))], () =>
      eventsOfType(shoveFromSideVent(createScriptedSession()), 'HazardShoved'),
    )
    expect(shove).toMatchObject({ tiles: 3, toTx: BELOW.tx, toTy: BELOW.ty + 3 })
  })

  it('never aims a shove of another kind', () => {
    const aim: ShoveAim = { id: 'probe.vane', kind: 'firedamp', isAimedOutward: () => true }
    const [shove] = withRegistrations([probeSlice((r) => r.shoveAim(aim))], () =>
      eventsOfType(shoveFromSideVent(createScriptedSession()), 'HazardShoved'),
    )
    expect(shove).toMatchObject({ tiles: 0 })
  })
})

describe('hazard clears', () => {
  /** Firedamp in GROUND, cut, then the rig standing in it for one drain interval. */
  function drainsInPocket(clear: HazardClear | null) {
    return withRegistrations(
      [probeSlice((r) => (clear === null ? undefined : r.hazardClear(clear)))],
      () => {
        const session = createScriptedSession()
        session.submit(START, placeHazardCommand('firedamp', GROUND.tx, GROUND.ty))
        mineTile(session, START + 1, GROUND)
        session.submit(START + 60, poseAbove(BELOW, FACING.down))
        const events = session.submit(START + 240, poseAbove(BELOW, FACING.down))
        const params = planetParamsOf(session.state().planet)
        if (params === null) throw new Error('planet 1 has no params')
        return {
          drained: eventsOfType(events, 'HazardDrained'),
          kind: hazardKindAtTile(session.state(), params, GROUND),
        }
      },
    )
  }

  it('drains in the pocket with no clear', () => {
    const { drained, kind } = drainsInPocket(null)
    expect(drained).toHaveLength(1)
    expect(kind).toBe('firedamp')
  })

  it('reads a cleared cell as no hazard, so the pocket drains nothing', () => {
    const clear: HazardClear = {
      id: 'probe.flask',
      kind: 'firedamp',
      isClearedAt: (_state, tile) => tile.tx === GROUND.tx && tile.ty === GROUND.ty,
    }
    const { drained, kind } = drainsInPocket(clear)
    expect(drained).toEqual([])
    expect(kind).toBeNull()
  })

  it('keeps the hazard on cells the clear does not answer for', () => {
    const clear: HazardClear = { id: 'probe.flask', kind: 'firedamp', isClearedAt: () => false }
    expect(drainsInPocket(clear).drained).toHaveLength(1)
  })
})
