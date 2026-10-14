import { describe, expect, it } from 'vitest'
import { withRegistrations } from '../../registries/registrar'
import { FLOOR, HEAT_PARAMS, onHeatPlanet } from '../authority/lava/lavaFixtures'
import { keyOfTile, reinforcementProbeSlice } from '../authority/collapse/reinforcementFixtures'
import {
  coreTiles,
  createScriptedSession,
  GROUND,
  surfaceOreTiles,
} from '../authority/scriptedSession'
import { isLavaAt } from '../world/lavaFlow'
import { isCellReinforced } from './groundReinforcement'

const onPlanetOne = () => createScriptedSession().state()

describe('ground reinforcement registry (ticket 365)', () => {
  it('reinforces nothing with no provider registered', () =>
    withRegistrations([], () => {
      expect(isCellReinforced(onPlanetOne(), GROUND.tx, GROUND.ty)).toBe(false)
    }))

  it('reinforces a cell any provider answers for, and only those', () =>
    withRegistrations([reinforcementProbeSlice({ cells: [GROUND], alsoRefusing: true })], () => {
      const state = onPlanetOne()
      expect(isCellReinforced(state, GROUND.tx, GROUND.ty)).toBe(true)
      expect(isCellReinforced(state, GROUND.tx + 1, GROUND.ty)).toBe(false)
    }))

  it('reinforces for every player, with no owner asked', () =>
    withRegistrations([reinforcementProbeSlice({ cells: [GROUND] })], () => {
      const state = createScriptedSession(['p1', 'p2']).state()
      expect(isCellReinforced(state, GROUND.tx, GROUND.ty)).toBe(true)
    }))
})

describe('ground reinforcement guards (ticket 365)', () => {
  it('never reinforces a dynamite- or rig-gated cell, whatever the provider says', () => {
    const [shell, rig, drillGated] = surfaceOreTiles(3)
    const gates = {
      [keyOfTile(shell)]: 'dynamite',
      [keyOfTile(rig)]: 'rig',
      [keyOfTile(drillGated)]: 'drill',
    }
    withRegistrations([reinforcementProbeSlice({ gates })], () => {
      const state = onPlanetOne()
      expect(isCellReinforced(state, shell.tx, shell.ty)).toBe(false)
      expect(isCellReinforced(state, rig.tx, rig.ty)).toBe(false)
      expect(isCellReinforced(state, drillGated.tx, drillGated.ty)).toBe(true)
    })
  })

  it('never reinforces a core cell', () =>
    withRegistrations([reinforcementProbeSlice()], () => {
      const [core] = coreTiles(1)
      expect(isCellReinforced(onPlanetOne(), core.tx, core.ty)).toBe(false)
    }))

  it('never reinforces lava', () =>
    withRegistrations([reinforcementProbeSlice()], () => {
      const state = onHeatPlanet().state()
      const plain = { tx: FLOOR.tx, ty: FLOOR.ty - 1 }
      expect(isLavaAt(state.world, HEAT_PARAMS, FLOOR)).toBe(true)
      expect(isCellReinforced(state, FLOOR.tx, FLOOR.ty)).toBe(false)
      expect(isCellReinforced(state, plain.tx, plain.ty)).toBe(true)
    }))
})
