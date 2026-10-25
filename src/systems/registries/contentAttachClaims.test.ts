import { describe, expect, it } from 'vitest'
import { withRegistrations } from '../../registries/registrar'
import type { SliceDefinition } from '../../registries/sliceDefinition'
import { contentRegistrationOf, type ContentKind, type ContentRegistration } from './content'
import { crossKindAttachProblemOf } from './contentAttachClaims'
import type { SealedRegistration } from './seal'
import type { VehicleItem } from './vehicleLoadout'

// One owner kind per attach point (ticket 881; the TD's Q3 on #850): the content registry refuses
// at load a named point claimed by entries of two content kinds, as a kit tool's socket on a gear
// item's point would be; one kind's own entries, `slot` and the shared cluster points pass.

const gear = (id: string, attach: VehicleItem['attach']): VehicleItem => ({
  id,
  iconId: 'icon',
  slots: [],
  attach,
})

/** An entry of another content kind with its own `attach`, as a kit socket's entry carries. */
function claimOf(
  kind: string,
  id: string,
  attach: string,
): SealedRegistration<ContentRegistration> {
  return { sliceId: 'probe', entry: { id, kind, entry: { id, iconId: 'icon', attach } as never } }
}

function gearClaimOf(item: VehicleItem): SealedRegistration<ContentRegistration> {
  return { sliceId: 'probe', entry: contentRegistrationOf('vehicle-item', item) }
}

describe('content attach claims', () => {
  it('passes points each claimed by one kind, two entries of one kind, slot and the shared clusters', () => {
    const claims = [
      gearClaimOf(gear('probe.hood_a', 'drill.hood')),
      gearClaimOf(gear('probe.hood_b', 'drill.hood')),
      gearClaimOf(gear('probe.slotted', 'slot')),
      gearClaimOf(gear('probe.gauge', 'cab.gauge')),
      claimOf('kit-item', 'probe.flask', 'cab.gauge'),
      claimOf('kit-item', 'probe.plough', 'kit.blade'),
    ]
    expect(crossKindAttachProblemOf(claims)).toBeNull()
  })

  it('names every point two kinds both claim', () => {
    const claims = [
      gearClaimOf(gear('probe.containment', 'drill.hood')),
      gearClaimOf(gear('probe.tether', 'hull.roof.mid')),
      claimOf('kit-item', 'probe.plough', 'drill.hood'),
      claimOf('kit-item', 'probe.vane', 'hull.roof.mid'),
    ]
    expect(crossKindAttachProblemOf(claims)).toBe(
      'attach points claimed by two content kinds: drill.hood by kit-item and vehicle-item; ' +
        'hull.roof.mid by kit-item and vehicle-item',
    )
  })

  it('refuses the registration at load when a slice hangs a second kind on a gear item’s point', () => {
    const slice: SliceDefinition = {
      id: 'probe',
      register: (r) => {
        r.content('vehicle-item', [gear('probe.containment', 'drill.hood')])
        r.content('probe-kind' as ContentKind, [
          { id: 'probe.plough', iconId: 'icon', attach: 'drill.hood' } as never,
        ])
      },
    }
    expect(() => withRegistrations([slice], () => null)).toThrow(/drill\.hood by probe-kind/)
  })
})
