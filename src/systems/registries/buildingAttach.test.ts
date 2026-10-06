import { describe, expect, it } from 'vitest'
import {
  attachIdsOfBuilding,
  BUILDING_ATTACH_USE_REGISTRY,
  buildingAttachUses,
  buildingBayOfAttach,
} from './buildingAttach'
import { addToRegistry, withFreshRegistrySet } from './seal'

describe('building attach registry', () => {
  it('puts the three sell points on the Exchange and the four workshop points on the Works', () => {
    expect(attachIdsOfBuilding('sell')).toEqual(['sell.chute', 'sell.ticker', 'sell.stack'])
    expect(attachIdsOfBuilding('upgrade')).toEqual([
      'workshop.gantry',
      'workshop.platform',
      'workshop.stack',
      'workshop.showcase_cam',
    ])
    expect(buildingBayOfAttach('workshop.showcase_cam')).toBe('upgrade')
  })

  it('reads no uses with nothing registered', () => {
    expect(
      withFreshRegistrySet(
        () => undefined,
        () => buildingAttachUses(),
      ),
    ).toEqual([])
  })

  it('reads the registered uses sorted by id', () => {
    const roll = { id: 'dock-buildings.roll', attach: 'workshop.platform' } as const
    const burst = { id: 'sell-juice.burst', attach: 'sell.chute' } as const
    const uses = withFreshRegistrySet(
      () => {
        addToRegistry(BUILDING_ATTACH_USE_REGISTRY, 'sell-juice', burst)
        addToRegistry(BUILDING_ATTACH_USE_REGISTRY, 'dock-buildings', roll)
      },
      () => buildingAttachUses(),
    )
    expect(uses).toEqual([roll, burst])
  })
})
