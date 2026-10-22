import { describe, expect, it } from 'vitest'
import { SHIPPED_ART } from '../../../../scene/shippedArt'
import { manifestEntryOf } from '../../../../systems/art/artCatalogue'
import { contentOf } from '../../../../systems/registries/content'
import { KERNEL_ITEMS, vehicleItemRefOf } from '../../../../systems/registries/kernelItems'
import {
  EMPTY_LOADOUT,
  withItemsOwned,
  withSlotItem,
} from '../../../../systems/vehicle/loadoutState'
import { REVEAL } from '../revealData'
import type { UnlockReveal } from '../unlockReveal'
import { glowSlotsOf, revealGlowAt, revealHangOf, revealModelOf } from './revealOnRig'

// The bought part on the car while the reveal plays (ticket 718): the item's own model glows, and
// a part the rig draws only from a slot hangs at its point for the reveal.

/** A power-up housing: drawn only while it sits in a slot. */
const SHIELD = 'power.steam_shield'
const RESONANCE = 'rig.resonance'

const REVEAL_AT_10: UnlockReveal = {
  revealed: { item: KERNEL_ITEMS.guns, name: 'Guns', iconId: 'icon-track-gun' },
  startTick: 10,
  endTick: 10 + REVEAL.revealTicks,
}

describe('unlock reveal on the rig: the model', () => {
  it('glows the turret’s parts, whatever their tier', () => {
    const model = revealModelOf(KERNEL_ITEMS.guns, SHIPPED_ART)
    expect(glowSlotsOf(model)).toEqual(['gun-barrel', 'turret-head', 'turret-mount'])
  })

  it('glows a gauge’s own dial, not the whole cab cluster it sits in', () => {
    const model = revealModelOf(vehicleItemRefOf('passive.assay_lens'), SHIPPED_ART)
    expect(model?.assetId).toBe('vehicle-cab-gauges')
    expect(glowSlotsOf(model)).toContain('dial-assay-lens')
    expect(glowSlotsOf(model)).not.toContain('dial-hazard-barometer')
  })

  it('names only models the game ships, for every capability it reveals', () => {
    const items = [...REVEAL.items, ...contentOf('vehicle-item').map((i) => vehicleItemRefOf(i.id))]
    const unshipped = items.flatMap((item) => {
      const model = revealModelOf(item, SHIPPED_ART)
      return model === null || manifestEntryOf(SHIPPED_ART, model.assetId) !== null
        ? []
        : [`${item.id} → ${model.assetId}`]
    })
    expect(unshipped).toEqual([])
  })

  it('gives every listed capability a model with parts to glow', () => {
    const bare = REVEAL.items.filter(
      (item) => glowSlotsOf(revealModelOf(item, SHIPPED_ART)).length === 0,
    )
    expect(bare).toEqual([])
  })
})

describe('unlock reveal on the rig: the glow', () => {
  it('pulses between its low and its high', () => {
    const glows = Array.from({ length: REVEAL.glow.pulseTicks }, (_, step) =>
      revealGlowAt(REVEAL_AT_10, 10 + step, false),
    )
    expect(Math.min(...glows)).toBeCloseTo(REVEAL.glow.low)
    expect(Math.max(...glows)).toBeCloseTo(REVEAL.glow.high)
  })

  it('holds steady at its high under Reduce Motion', () => {
    expect(revealGlowAt(REVEAL_AT_10, 17, true)).toBe(REVEAL.glow.high)
    expect(revealGlowAt(REVEAL_AT_10, 31, true)).toBe(REVEAL.glow.high)
  })
})

describe('unlock reveal on the rig: hanging a slot part', () => {
  it('hangs a power-up the rig does not draw yet at its first slot’s point', () => {
    const hang = revealHangOf(vehicleItemRefOf(SHIELD), withItemsOwned(EMPTY_LOADOUT, [SHIELD]))
    expect(hang).toEqual({
      kind: 'swap',
      attach: 'hull.powerup.1',
      assetId: 'vehicle-item-power-steam-shield',
      partIds: ['shield-housing'],
    })
  })

  it('hangs nothing the rig already draws: a fitted power-up or an extractor', () => {
    const fitted = withSlotItem(withItemsOwned(EMPTY_LOADOUT, [SHIELD]), 'powerup.1', SHIELD)
    expect(revealHangOf(vehicleItemRefOf(SHIELD), fitted)).toBeNull()
    const extractor = withItemsOwned(EMPTY_LOADOUT, [RESONANCE])
    expect(revealHangOf(vehicleItemRefOf(RESONANCE), extractor)).toBeNull()
  })

  it('hangs nothing for the turret, which the guns draw once mounted', () => {
    expect(revealHangOf(KERNEL_ITEMS.guns, EMPTY_LOADOUT)).toBeNull()
  })
})
