import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { withRegistrations } from '../registries/registrar'
import type { SliceDefinition } from '../registries/sliceDefinition'
import { vectorIconIds } from '../systems/art/artIds'
import { iconRegistryProblems, KNOWN_ICON_GAPS } from '../systems/art/icons/iconCoverage'
import { oreIconIdOf, type OreIconFamily } from '../systems/art/icons/oreIcon'
import { oreTier } from '../systems/economy/oreEconomy'
import { contentIconIds } from '../systems/registries/content'
import { oreTypeCatalogue, oreTypeOf } from '../systems/registries/oreTypes'
import { energyWarningMarkers } from '../systems/views/hudModel'
import { vehicleModeMarkers } from '../systems/views/hudReadings'
import { BAND_COUNT } from '../systems/world/planetGeometry'
import { RESOURCE_FAMILY } from '../systems/world/worldCell'
import { VectorIcon } from './VectorIcon'
import { iconIdsShippedTwice, iconUrlOf, warnOfMissingIcon } from './vectorIcons'

// The kernel icon registry's coverage (feature-slices.md 3.4): every id the game can name, from the
// kernel and from every registered slice, resolves to a shipped SVG (the kernel's or a slice's
// icons/ folder) or a generated ore icon. The allowlist is #163's KNOWN_ICON_GAPS, shrink-only:
// #163 drew the nine ids the standard listed (the HUD markers and the bay emblems) before this
// test landed, so it is pinned empty.

/** Shrink-only: the ids allowed to stay missing. */
const PINNED_ALLOWLIST: readonly string[] = []

/** #155 endless coverage (TD comment): the ore tiers of planets 1 to 100, not only the slice's. */
const LAST_COVERED_PLANET = 100

const ORE_ICON_FAMILIES: readonly OreIconFamily[] = ['metal', 'crystal', 'mixed']

const CELL_FAMILIES = [RESOURCE_FAMILY.metal, RESOURCE_FAMILY.crystal]

const isShipped = (iconId: string) => iconUrlOf(iconId) !== null

function markerIconIds(): string[] {
  return [...Object.values(vehicleModeMarkers()), ...Object.values(energyWarningMarkers())].map(
    (marker) => marker.icon,
  )
}

/** Every ore tier a cell can hold on planets 1 to 100: one per band (#4, #6). */
function endlessOreTiers(): number[] {
  const tiers = new Set<number>()
  for (let planet = 1; planet <= LAST_COVERED_PLANET; planet++)
    for (let band = 1; band <= BAND_COUNT; band++) tiers.add(oreTier(planet, band))
  return [...tiers]
}

/** The ore icons the bays draw and the ore type a cell answers to, for every endless tier. */
function endlessOreIconIds(): string[] {
  return endlessOreTiers().flatMap((tier) => [
    ...ORE_ICON_FAMILIES.map((family) => oreIconIdOf(family, tier)),
    ...CELL_FAMILIES.map((cellFamily) => oreTypeOf({ tier, cellFamily }).iconId),
  ])
}

/** Every id the game can name, from the kernel and the registered slices. */
function everyNamedIconId(): string[] {
  return [
    ...contentIconIds().map((use) => use.iconId),
    ...oreTypeCatalogue().map((ore) => ore.iconId),
    ...vectorIconIds(),
    ...markerIconIds(),
    ...endlessOreIconIds(),
  ]
}

const contentSliceOf = (iconId: string): SliceDefinition => ({
  id: 'icon-probe',
  register: (r) =>
    r.content('vehicle-item', [{ id: 'icon-probe.drill', iconId, slots: ['rig.1'], attach: null }]),
})

describe('icon registry coverage', () => {
  it('resolves every id the kernel and the loaded slices name, the ore of planets 1 to 100 included', () => {
    expect(endlessOreTiers().length).toBeGreaterThan(40 * BAND_COUNT)
    expect(iconRegistryProblems(everyNamedIconId(), isShipped)).toEqual([])
  })

  it('keeps the allowlist of missing ids exactly as pinned: it only shrinks', () => {
    expect(KNOWN_ICON_GAPS).toEqual(PINNED_ALLOWLIST)
  })

  it('ships no icon id from two folders', () => {
    expect(iconIdsShippedTwice()).toEqual([])
  })

  it('fails a slice content entry whose icon does not ship', () => {
    const problems = withRegistrations([contentSliceOf('icon-probe-drill')], () =>
      iconRegistryProblems(everyNamedIconId(), isShipped),
    )
    expect(problems).toEqual(['icon "icon-probe-drill" is named but does not ship'])
  })

  it('fails an allowlisted id that ships, and lets an allowlisted missing one pass', () => {
    const problems = iconRegistryProblems(['icon-sell', 'icon-unknown'], isShipped, [
      'icon-sell',
      'icon-unknown',
    ])
    expect(problems).toEqual(['icon "icon-sell" ships now: take it off the allowlist'])
  })

  it('never asks for the ids that mean no icon', () => {
    expect(iconRegistryProblems(['', 'none'], isShipped)).toEqual([])
  })
})

describe('VectorIcon fallback', () => {
  const render = (iconId: string) => renderToString(createElement(VectorIcon, { iconId }))

  it('marks an unknown id with data-missing-icon and draws a placeholder in its place', () => {
    const html = render('icon-never-shipped')
    expect(html).toContain('data-missing-icon="icon-never-shipped"')
    expect(html).not.toContain('<img')
  })

  it('draws a shipped icon without the missing mark', () => {
    const html = render('icon-sell')
    expect(html).toContain('<img')
    expect(html).not.toContain('data-missing-icon')
  })

  it('warns once per missing id', () => {
    const warnings: string[] = []
    const warn = (message: string) => warnings.push(message)
    warnOfMissingIcon('icon-warned-probe', warn)
    warnOfMissingIcon('icon-warned-probe', warn)
    warnOfMissingIcon('icon-other-probe', warn)
    expect(warnings).toHaveLength(2)
  })
})
