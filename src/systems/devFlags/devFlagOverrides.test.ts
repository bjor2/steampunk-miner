import { describe, expect, it } from 'vitest'
import {
  devFlagOverridesText,
  isPinnedAgainstChangedDefault,
  readDevFlagOverrides,
  SHIPPED_DEV_FLAGS,
  withChosenDevFlags,
  type ShippedDevFlags,
} from './devFlagOverrides'

// The browser's remembered overrides (ticket 548, the #548 ruling and VS 5 on #547): only the
// differences from the shipped defaults, unknown keys dropped, and a flipped default never
// silently pinned by an old override.

/** A later release that ships `drill.exactCarry` off. */
const EXACT_CARRY_FLIPPED: ShippedDevFlags = { ...SHIPPED_DEV_FLAGS, 'drill.exactCarry': false }

const roundTrip = (text: string | null, shipped?: ShippedDevFlags) =>
  readDevFlagOverrides(text, shipped)

describe('dev flag overrides', () => {
  it('keeps nothing from a clean browser', () => {
    expect(readDevFlagOverrides(null).overrides).toEqual({})
    expect(devFlagOverridesText({})).toBeNull()
  })

  it('remembers a toggle across a write and a read, with the default it was set against', () => {
    const chosen = withChosenDevFlags({}, { 'drill.sweptCut': false })
    const reading = roundTrip(devFlagOverridesText(chosen))
    expect(reading.overrides).toEqual({ 'drill.sweptCut': { isOn: false, defaultWhenSet: true } })
    expect(reading.changedDefaults).toEqual([])
  })

  it('stores only the differences: a choice equal to its default removes the entry', () => {
    const off = withChosenDevFlags({}, { 'heat.workUncapped': false, 'drill.exactCarry': true })
    expect(Object.keys(off)).toEqual(['heat.workUncapped'])
    const back = withChosenDevFlags(off, { 'heat.workUncapped': true })
    expect(devFlagOverridesText(back)).toBeNull()
  })

  it('drops a stored entry that equals its default on read', () => {
    const text = JSON.stringify({ 'drill.exactCarry': { isOn: true, defaultWhenSet: true } })
    expect(readDevFlagOverrides(text).overrides).toEqual({})
  })

  it('drops unknown keys and malformed entries on read, and names them', () => {
    const text = JSON.stringify({
      'drill.tickFloor': { isOn: false, defaultWhenSet: true },
      'drill.sweptCut': { isOn: 'no', defaultWhenSet: true },
      'heat.workUncapped': { isOn: false, defaultWhenSet: true },
    })
    const reading = readDevFlagOverrides(text)
    expect(reading.overrides).toEqual({
      'heat.workUncapped': { isOn: false, defaultWhenSet: true },
    })
    expect(reading.droppedIds).toEqual(['drill.tickFloor', 'drill.sweptCut'])
  })

  it('keeps nothing from text that is not an object of overrides', () => {
    expect(readDevFlagOverrides('not json').overrides).toEqual({})
    expect(readDevFlagOverrides('[1, 2]').overrides).toEqual({})
  })

  it('reports a flipped default instead of keeping the old override, which now equals it', () => {
    const text = devFlagOverridesText(withChosenDevFlags({}, { 'drill.exactCarry': false }))
    const reading = roundTrip(text, EXACT_CARRY_FLIPPED)
    expect(reading.overrides).toEqual({})
    expect(reading.changedDefaults).toEqual(['drill.exactCarry'])
  })

  it('keeps an entry that opposes a changed default and marks it pinned', () => {
    const text = JSON.stringify({ 'drill.exactCarry': { isOn: true, defaultWhenSet: true } })
    const reading = roundTrip(text, EXACT_CARRY_FLIPPED)
    const override = reading.overrides['drill.exactCarry']
    expect(override?.isOn).toBe(true)
    expect(
      override && isPinnedAgainstChangedDefault(override, 'drill.exactCarry', EXACT_CARRY_FLIPPED),
    ).toBe(true)
  })

  it('does not mark an override pinned while its default stands', () => {
    const chosen = withChosenDevFlags({}, { 'enemy.lureRetarget': false })
    const override = chosen['enemy.lureRetarget']
    expect(override && isPinnedAgainstChangedDefault(override, 'enemy.lureRetarget')).toBe(false)
  })
})
