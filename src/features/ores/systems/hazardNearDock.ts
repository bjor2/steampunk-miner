/**
 * The hazard a player meets on landing (ticket 656, the GD bar on spec #647 that a planet's hazard
 * shows within a minute of landing; ticket 651's 20 columns of the dock point): the kinds of the
 * pockets in the ground as it stands now, in the columns either side of the dock point, from the
 * pad down past the planet's hazard window. Read through the kernel's pocket read, so a planet
 * held under ore rules 7 or earlier, and planet 1, meet none.
 */
import {
  hazardPocketTestOf,
  type HazardPocketTest,
} from '../../../systems/registries/hazardPockets'
import { dockSiteOf } from '../../../systems/world/dockSite'
import type { PlanetParams } from '../../../systems/world/planetParams'
import { cellAt, type WorldState } from '../../../systems/world/worldState'
import { ORE_ROWS } from './oreRows'
import { hazardDepthWindowCellsOf, hazardOfPlanet } from './planetHazards'

/** Ticket 651's reach of a first look round the dock: 20 columns either side of the dock point. */
export const LANDING_COLUMNS = 20

/** The pocket kinds within `LANDING_COLUMNS` of the dock point, sorted; empty for none. */
export function pocketKindsNearDock(params: PlanetParams, world: WorldState): string[] {
  const test = hazardPocketTestOf(params)
  if (test === null) return []
  return [...new Set(pocketKindsUnderDock(params, world, test))].sort()
}

function pocketKindsUnderDock(
  params: PlanetParams,
  world: WorldState,
  test: HazardPocketTest,
): string[] {
  const { padRow } = dockSiteOf(params)
  const deepest = padRow - windowBottomCellsOf(params) - 1
  const kinds: string[] = []
  for (let tx = -LANDING_COLUMNS; tx <= LANDING_COLUMNS; tx++) {
    for (let ty = padRow; ty >= deepest; ty--) {
      const kind = test({ tx, ty }, cellAt(world, params, { tx, ty }))
      if (kind !== null) kinds.push(kind)
    }
  }
  return kinds
}

/** How deep the window's bottom lies, in cells from the surface; 0 with no hazard row. */
function windowBottomCellsOf(params: PlanetParams): number {
  const hazard = hazardOfPlanet(ORE_ROWS.planets, params.planetIndex)
  return hazard === null ? 0 : hazardDepthWindowCellsOf(hazard, params.radiusTiles).toCells
}
