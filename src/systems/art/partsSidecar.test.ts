import { describe, expect, it } from 'vitest'
import {
  attachPointOf,
  mapFilesOf,
  placeholderDriftProblems,
  sidecarProblems,
} from './partsSidecar'
import { VEHICLE_ATTACH, vehicleSidecar, WHEEL_PART } from './sidecarFixtures'

const wheel = WHEEL_PART

/** The platform hub's sidecar: an asset other than the base vehicle, with no attach array. */
function hubSidecar(): ReturnType<typeof vehicleSidecar> {
  return {
    ...vehicleSidecar([{ ...WHEEL_PART, id: 'outpost' }]),
    assetId: 'platform-hub',
    pxPerMetre: 256,
    maps: {
      albedo: 'platform-hub.albedo.ktx2',
      normal: 'platform-hub.normal.ktx2',
      emissive: false as const,
    },
    attach: undefined,
  }
}

describe('parts sidecar', () => {
  it('accepts a schema-1 vehicle sidecar with valid parts', () => {
    expect(sidecarProblems('vehicle', vehicleSidecar())).toEqual([])
  })

  it('accepts repeated parts with a numeric suffix from 2, and parts of later tiers', () => {
    const parts = [
      wheel,
      { ...wheel, id: 't1-wheel-2' },
      { ...wheel, id: 't3-armour-plate', tier: 3 },
    ]
    expect(sidecarProblems('vehicle', vehicleSidecar(parts))).toEqual([])
  })

  it('refuses a part id outside the t<tier>-<part> pattern or the inventory parts', () => {
    const parts = [
      { ...wheel, id: 'wheel' },
      { ...wheel, id: 't1-turret' },
      { ...wheel, id: 't1-wheel-1' },
    ]
    expect(sidecarProblems('vehicle', vehicleSidecar(parts))).toEqual([
      'vehicle.parts.json: part "wheel" is not a valid part id',
      'vehicle.parts.json: part "t1-turret" is not a valid part id',
      'vehicle.parts.json: part "t1-wheel-1" is not a valid part id',
    ])
  })

  it('refuses a zero-size rect, a pivot outside the part and a tier its id contradicts', () => {
    const parts = [
      { ...wheel, rect: [8, 8, 0, 123] as const, pivotM: [0.3, 0.1] as const, tier: 2 },
    ]
    expect(sidecarProblems('vehicle', vehicleSidecar(parts))).toEqual([
      'vehicle.parts.json: part "t1-wheel" tier must be a whole number from 1, as its id says',
      'vehicle.parts.json: part "t1-wheel" rect must be a non-empty area in the atlas',
      'vehicle.parts.json: part "t1-wheel" pivotM must lie inside sizeM',
    ])
  })

  it('refuses a rect that runs off the atlas', () => {
    const sidecar = vehicleSidecar([{ ...wheel, rect: [200, 8, 123, 123] }])
    expect(sidecarProblems('vehicle', sidecar)).toEqual([
      'vehicle.parts.json: part "t1-wheel" rect must be a non-empty area in the atlas',
    ])
  })

  it('refuses an atlas side that is not a power of two or is over 4096 px', () => {
    expect(sidecarProblems('vehicle', { ...vehicleSidecar(), atlasPx: [8192, 256] })).toEqual([
      'vehicle.parts.json: atlasPx must be power-of-two sides up to 4096',
    ])
    expect(sidecarProblems('vehicle', { ...vehicleSidecar(), atlasPx: [256, 384] })).toEqual([
      'vehicle.parts.json: atlasPx must be power-of-two sides up to 4096',
    ])
  })

  it('refuses the wrong schema, asset id, texel density or map names', () => {
    const sidecar = vehicleSidecar()
    const broken = {
      ...sidecar,
      schema: 2,
      assetId: 'car',
      pxPerMetre: 256,
      maps: { ...sidecar.maps, normal: 'vehicle.normal.png' },
    }
    expect(sidecarProblems('vehicle', broken)).toEqual([
      'vehicle.parts.json: schema must be 1',
      'vehicle.parts.json: assetId must be "vehicle"',
      'vehicle.parts.json: pxPerMetre must be 512 for a vehicle asset',
      'vehicle.parts.json: maps.normal must be "vehicle.normal.ktx2"',
    ])
  })

  it('takes registry-derived part ids on other assets', () => {
    const hub = {
      ...vehicleSidecar([
        { ...wheel, id: 'outpost' },
        { ...wheel, id: 'core-drive' },
      ]),
      assetId: 'platform-hub',
      pxPerMetre: 256,
      maps: {
        albedo: 'platform-hub.albedo.ktx2',
        normal: 'platform-hub.normal.ktx2',
        emissive: false as const,
      },
    }
    expect(sidecarProblems('platform-hub', hub)).toEqual([])
    expect(sidecarProblems('platform-hub', { ...hub, parts: [{ ...wheel, id: 'tower' }] })).toEqual(
      ['platform-hub.parts.json: part "tower" is not a valid part id'],
    )
  })

  it('names no emissive map for an asset where nothing glows', () => {
    const sidecar = vehicleSidecar()
    expect(mapFilesOf(sidecar)).toEqual([
      'vehicle.albedo.ktx2',
      'vehicle.normal.ktx2',
      'vehicle.emissive.ktx2',
    ])
    expect(mapFilesOf({ ...sidecar, maps: { ...sidecar.maps, emissive: false } })).toEqual([
      'vehicle.albedo.ktx2',
      'vehicle.normal.ktx2',
    ])
  })
})

describe("parts sidecar: the base vehicle's attach points", () => {
  const sidecar = vehicleSidecar()

  it('requires the attach array, with every attach id, on the base vehicle', () => {
    expect(sidecarProblems('vehicle', sidecar)).toEqual([])
    expect(sidecarProblems('vehicle', { ...sidecar, attach: undefined })).toEqual([
      'vehicle.parts.json: the base vehicle needs an attach array',
    ])
    const withoutFork = VEHICLE_ATTACH.filter((point) => point.id !== 'drill.fork')
    expect(sidecarProblems('vehicle', { ...sidecar, attach: withoutFork })).toEqual([
      'vehicle.parts.json: attach "drill.fork" is missing',
    ])
  })

  it('refuses a point on the base vehicle that is not a vehicle attach id', () => {
    const attach = [...VEHICLE_ATTACH, { id: 'hull.keel', atM: [0, 0] as const, z: 1 }]
    expect(sidecarProblems('vehicle', { ...sidecar, attach })).toEqual([
      'vehicle.parts.json: attach "hull.keel" is not a vehicle attach id',
    ])
  })

  it('asks no attach array of any other asset', () => {
    expect(sidecarProblems('platform-hub', hubSidecar())).toEqual([])
  })
})

describe('parts sidecar: replacing a placeholder', () => {
  const placeholder = vehicleSidecar([wheel, { ...wheel, id: 't1-chassis' }])

  it('accepts an export with the same part ids and maps, whatever its sizes and rects', () => {
    const exported = vehicleSidecar([
      { ...wheel, id: 't1-chassis', rect: [8, 8, 300, 200], sizeM: [0.6, 0.4] },
      { ...wheel, rect: [324, 8, 130, 130] },
    ])
    expect(placeholderDriftProblems(placeholder, exported)).toEqual([])
  })

  it('names every part the export drops or adds', () => {
    const exported = vehicleSidecar([wheel, { ...wheel, id: 't1-boiler' }])
    expect(placeholderDriftProblems(placeholder, exported)).toEqual([
      'vehicle.parts.json: part "t1-chassis" is missing',
      'vehicle.parts.json: part "t1-boiler" has no placeholder',
    ])
  })

  it('names a map the export ships differently from its placeholder', () => {
    const exported = vehicleSidecar([wheel, { ...wheel, id: 't1-chassis' }])
    const dark = { ...exported, maps: { ...exported.maps, emissive: false as const } }
    expect(placeholderDriftProblems(placeholder, dark)).toEqual([
      "vehicle.parts.json: maps.emissive is false, its placeholder's is vehicle.emissive.ktx2",
    ])
  })
})

describe('parts sidecar: attach points', () => {
  const chute = { id: 'sell.chute', atM: [1.5, 0.4] as const, z: 2 }

  it('takes an optional attach array of dotted ids in the asset frame (#162 K5 shape)', () => {
    const sidecar = { ...hubSidecar(), attach: [chute, { ...chute, id: 'hull.roof.aft' }] }
    expect(sidecarProblems(sidecar.assetId, sidecar)).toEqual([])
    expect(attachPointOf(sidecar, 'sell.chute')).toEqual(chute)
    expect(attachPointOf(sidecar, 'sell.stack')).toBeNull()
    expect(attachPointOf(hubSidecar(), 'sell.chute')).toBeNull()
  })

  it('refuses an attach id without a dot, a repeated id, a non-finite point or a fractional z', () => {
    const attach = [
      { ...chute, id: 'chute' },
      chute,
      { ...chute, atM: [Number.NaN, 0] as const, z: 0.5 },
    ]
    expect(sidecarProblems('platform-hub', { ...hubSidecar(), attach })).toEqual([
      'platform-hub.parts.json: attach "sell.chute" is listed twice',
      'platform-hub.parts.json: attach "chute" is not a dotted attach id',
      'platform-hub.parts.json: attach "sell.chute" atM must be two numbers',
      'platform-hub.parts.json: attach "sell.chute" z must be a whole number',
    ])
  })
})
