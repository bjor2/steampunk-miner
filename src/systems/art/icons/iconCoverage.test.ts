import { describe, expect, it } from 'vitest'
import { SHIPPED_ART } from '../../../scene/shippedArt'
import { energyWarningMarkers } from '../../views/hudModel'
import { vehicleModeMarkers } from '../../views/hudReadings'
import { KNOWN_ICON_GAPS, resolvesIcon, unresolvedIconIds } from './iconCoverage'
import { iconFileIds } from './iconSet'
import { oreIconIdOf } from './oreIcon'

// The coverage rule of #158 section 3: every surface's icon ids resolve to a shipped SVG or a
// generated ore icon. Each surface lists its ids through its own model, so a data entry with no
// icon fails here, not on screen.

const markerIcons = (markers: Readonly<Record<string, { icon: string }>>): string[] =>
  Object.values(markers)
    .map((marker) => marker.icon)
    .filter((icon) => icon !== '')

describe('icon coverage (#158 section 3)', () => {
  it('resolves a set icon and an ore icon, and refuses an unknown id', () => {
    expect(resolvesIcon('icon-track-hull', SHIPPED_ART)).toBe(true)
    expect(resolvesIcon(oreIconIdOf('crystal', 40), SHIPPED_ART)).toBe(true)
    expect(resolvesIcon('anchor', SHIPPED_ART)).toBe(false)
    expect(unresolvedIconIds(['anchor', 'anchor', 'icon-casing'], SHIPPED_ART)).toEqual(['anchor'])
  })

  it('has emptied the allowlist of known gaps', () => {
    expect(KNOWN_ICON_GAPS).toEqual([])
  })

  it('ships every icon of the set', () => {
    expect(unresolvedIconIds(iconFileIds(), SHIPPED_ART)).toEqual([])
  })

  it("gives the HUD's vehicle states and energy warnings icons that exist", () => {
    const ids = [...markerIcons(vehicleModeMarkers()), ...markerIcons(energyWarningMarkers())]
    expect(ids.length).toBeGreaterThanOrEqual(5)
    expect(unresolvedIconIds(ids, SHIPPED_ART)).toEqual([])
  })
})
