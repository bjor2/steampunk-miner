import { describe, expect, it } from 'vitest'
import {
  chosenClientFlagsOf,
  hasPendingFlips,
  settledClientFlags,
  SHIPPED_CLIENT_DEV_FLAGS,
  withChosenClientFlags,
} from './clientDevFlags'

// The client loop's flags (ticket 548, the TD ruling on #547 section 2): `drill.reportEveryTick`
// flips at once, `drill.sweptCut` waits for an idle drill and shows as pending until then.

const SHIPPED = SHIPPED_CLIENT_DEV_FLAGS

describe('client dev flags', () => {
  it('flips drill.reportEveryTick at once', () => {
    const next = withChosenClientFlags(SHIPPED, { 'drill.reportEveryTick': false })
    expect(next.flags['drill.reportEveryTick']).toBe(false)
    expect(hasPendingFlips(next)).toBe(false)
  })

  it('holds a drill.sweptCut flip pending while the drill bites', () => {
    const chosen = withChosenClientFlags(SHIPPED, { 'drill.sweptCut': false })
    expect(chosen.flags['drill.sweptCut']).toBe(true)
    expect(chosen.pending).toEqual({ 'drill.sweptCut': false })
    expect(chosenClientFlagsOf(chosen)['drill.sweptCut']).toBe(false)
    const biting = settledClientFlags(chosen, false)
    expect(biting).toBe(chosen)
  })

  it('applies the pending drill.sweptCut flip once the drill is idle', () => {
    const chosen = withChosenClientFlags(SHIPPED, { 'drill.sweptCut': false })
    const idle = settledClientFlags(chosen, true)
    expect(idle.flags['drill.sweptCut']).toBe(false)
    expect(hasPendingFlips(idle)).toBe(false)
  })

  it('cancels a pending flip chosen back to the running value', () => {
    const chosen = withChosenClientFlags(SHIPPED, { 'drill.sweptCut': false })
    const back = withChosenClientFlags(chosen, { 'drill.sweptCut': true })
    expect(back.flags).toEqual(SHIPPED.flags)
    expect(hasPendingFlips(back)).toBe(false)
  })

  it('leaves the flags untouched at their defaults', () => {
    const same = withChosenClientFlags(SHIPPED, { ...SHIPPED.flags })
    expect(same).toEqual(SHIPPED)
    expect(settledClientFlags(SHIPPED, true)).toBe(SHIPPED)
  })
})
