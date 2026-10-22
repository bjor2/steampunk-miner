import { describe, expect, it } from 'vitest'
import { listBuyableRefs } from '../registries/buyableRefs'
import { contentOf } from '../registries/content'
import { KERNEL_ITEMS, trackItemOf, vehicleItemRefOf } from '../registries/kernelItems'
import type { ItemRef } from '../registries/itemDescriber'
import {
  isNewCapabilityBuy,
  isNewCapabilityItem,
  NEW_CAPABILITIES,
  NONE_OWNED,
} from './newCapability'

// The new-capability flag (spec #678, tickets 718 and 719): one data table the unlock reveal and
// the shop's guidance chip both read, so a stat step can never pass for a new capability.

/** Every planet the shop reaches in the specs, so a late item's ref is listed too. */
const LAST_PLANET = 60

const keyOf = (ref: ItemRef) => `${ref.kind}:${ref.id}`

describe('new capability', () => {
  it('counts every vehicle item the tree unlocks, unowned', () => {
    const items = contentOf('vehicle-item')
    expect(items.length).toBeGreaterThan(0)
    expect(items.every((item) => isNewCapabilityBuy(vehicleItemRefOf(item.id), NONE_OWNED))).toBe(
      true,
    )
  })

  it('counts the turret’s mount, and none of its later levels', () => {
    expect(isNewCapabilityBuy(KERNEL_ITEMS.guns, NONE_OWNED)).toBe(true)
    expect(isNewCapabilityBuy(KERNEL_ITEMS.guns, 1)).toBe(false)
  })

  it('never counts a stat step, a refill or a service', () => {
    const stat = [trackItemOf('drill_power'), KERNEL_ITEMS.casing, KERNEL_ITEMS.chargeRack]
    const refills = [KERNEL_ITEMS.charges, KERNEL_ITEMS.repair, KERNEL_ITEMS.recharge]
    expect([...stat, ...refills].filter((item) => isNewCapabilityItem(item))).toEqual([])
  })

  it('names only items the game sells', () => {
    const sold = new Set(listBuyableRefs(LAST_PLANET).map(keyOf))
    expect(NEW_CAPABILITIES.items.map(keyOf).filter((key) => !sold.has(key))).toEqual([])
  })
})
