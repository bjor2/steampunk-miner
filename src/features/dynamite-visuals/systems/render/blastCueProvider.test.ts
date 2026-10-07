import { describe, expect, it } from 'vitest'
import { withRegistrations } from '../../../../registries/registrar'
import type { DomainEvent } from '../../../../systems/authority/domainEvent'
import { feedbackCuesOf } from '../../../../systems/feedback/feedbackCues'
import {
  chargeBlastKickOf,
  SHIPPED_CHARGE_BLAST_KICK,
  type ChargeDetonatedEvent,
} from '../../../../systems/registries/chargeBlastCue'
import { slice } from '../../register'

// The #143 ladder's radii for sizes 1, 5 and 10, fixtures only.
const detonationOf = (size: number, radiusMm?: number): ChargeDetonatedEvent => ({
  type: 'ChargeDetonated',
  tick: 720,
  playerId: 'p1',
  tx: 3,
  ty: 280,
  size,
  ...(radiusMm === undefined ? {} : { radiusMm }),
  by: 'fuse',
})

const kickWithSlice = (detonated: ChargeDetonatedEvent, distanceMm: number) =>
  withRegistrations([slice], () => chargeBlastKickOf(detonated, distanceMm))

describe('dynamite blast cue provider', () => {
  it('kicks the shipped charge at its tile exactly as main does: shake 0.8, no flash, no delay', () => {
    expect(kickWithSlice(detonationOf(1, 2500), 0)).toEqual({
      shake: 0.8,
      flash: 0,
      thumpDelayTicks: 0,
    })
  })

  it('kicks sizes 5 and 10 harder at the blast and lets the kick fade with distance', () => {
    expect(kickWithSlice(detonationOf(5, 8000), 0)).toMatchObject({ flash: 0.5 })
    expect(kickWithSlice(detonationOf(10, 24000), 0)).toEqual({
      shake: 1,
      flash: 1,
      thumpDelayTicks: 0,
    })
    expect(kickWithSlice(detonationOf(10, 24000), 36000)).toEqual({
      shake: 0,
      flash: 0,
      thumpDelayTicks: 36,
    })
  })

  it("takes a detonation's radius from the kernel ladder when the event carries none", () => {
    expect(kickWithSlice(detonationOf(10), 30000)).toEqual(
      kickWithSlice(detonationOf(10, 24000), 30000),
    )
  })

  it('kicks every blast as main does with the slice removed', () => {
    const kicks = withRegistrations([], () =>
      [detonationOf(1, 2500), detonationOf(10, 24000)].map((detonated) =>
        chargeBlastKickOf(detonated, 36000),
      ),
    )
    expect(kicks).toEqual([SHIPPED_CHARGE_BLAST_KICK, SHIPPED_CHARGE_BLAST_KICK])
  })

  it('reaches the local player through the kernel feedback cues', () => {
    const blast: DomainEvent = detonationOf(10, 24000)
    const cues = withRegistrations([slice], () => feedbackCuesOf([blast], 'p1'))
    expect(cues).toEqual([
      { kind: 'chargeBlast', kick: { shake: 1, flash: 1, thumpDelayTicks: 0 } },
    ])
  })
})
