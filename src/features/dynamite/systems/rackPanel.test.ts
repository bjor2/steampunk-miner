import { describe, expect, it } from 'vitest'
import type { AuthorityState } from '../../../systems/authority/authorityState'
import {
  plantSized,
  poseOnTile,
  sizedBlasterOn,
} from '../../../systems/authority/charges/chargeFixtures'
import { createScriptedSession } from '../../../systems/authority/scriptedSession'
import { ACTION_MAP, defaultBindings } from '../../../systems/input/actionMap'
import { rackPanelOf } from './rackPanel'

const BINDINGS = defaultBindings(ACTION_MAP)

const panelOn = (state: AuthorityState, chosenSize = 1) =>
  rackPanelOf({ state, playerId: 'p1', chosenSize, bindings: BINDINGS })

describe('dynamite rack panel', () => {
  it('shows nothing before the rack is bolted on', () => {
    expect(panelOn(createScriptedSession().state())).toBeNull()
  })

  it('shows the size the plant key plants, its radius and how many the rack holds', () => {
    const { session } = sizedBlasterOn(16, 4, 2)
    expect(panelOn(session.state(), 4)).toEqual({
      size: 4,
      iconId: 'dynamite-size-4',
      sizeText: 'Size 4 · 6 m',
      carried: 2,
      nextSizeText: null,
      plungerText: null,
    })
    expect(panelOn(sizedBlasterOn(7, 1).session.state())?.sizeText).toBe('Size 1 · 2.5 m')
  })

  it('names the size key once the rack holds two sizes', () => {
    const { session } = sizedBlasterOn(16, 4, 1)
    session.submit(1, { type: 'debug.setMoney', payload: { amount: '1e30' } })
    session.submit(1, { type: 'debug.teleportToDock', payload: { bay: 'upgrade' } })
    session.submit(1, { type: 'restockCharges', payload: { size: 1, count: 2 } })
    expect(panelOn(session.state(), 4)?.nextSizeText).toBe('Next size (V)')
  })

  it('offers Detonate on the plant key for a live charge outside the interlock from P22', () => {
    const blaster = sizedBlasterOn(25, 7)
    plantSized(blaster.session, blaster, 7, 1)
    expect(panelOn(blaster.session.state(), 7)?.plungerText).toBe('Back off to detonate')
    blaster.session.submit(2, poseOnTile({ tx: blaster.wall.tx - 15, ty: blaster.wall.ty }))
    expect(panelOn(blaster.session.state(), 7)?.plungerText).toBe('Detonate (B)')
  })

  it('offers no plunger before P22, where only the fuse fires a charge', () => {
    const blaster = sizedBlasterOn(19, 5)
    plantSized(blaster.session, blaster, 5, 1)
    expect(panelOn(blaster.session.state(), 5)?.plungerText).toBeNull()
  })
})
