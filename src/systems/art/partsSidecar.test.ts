import { describe, expect, it } from 'vitest'
import {
  mapFilesOf,
  placeholderDriftProblems,
  sidecarProblems,
  type PartsSidecar,
  type SidecarPart,
} from './partsSidecar'

const wheel: SidecarPart = {
  id: 't1-wheel',
  tier: 1,
  rect: [8, 8, 123, 123],
  sizeM: [0.24, 0.24],
  pivotM: [0.12, 0.12],
  atM: [-0.32, -0.36],
  z: 1,
}

function vehicleSidecar(parts: SidecarPart[] = [wheel]): PartsSidecar {
  return {
    assetId: 'vehicle',
    schema: 1,
    source: { blend: 'art/blender/vehicle/vehicle.blend', sha256: null, blender: null },
    pxPerMetre: 512,
    atlasPx: [256, 256],
    maps: {
      albedo: 'vehicle.albedo.ktx2',
      normal: 'vehicle.normal.ktx2',
      emissive: 'vehicle.emissive.ktx2',
    },
    parts,
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
