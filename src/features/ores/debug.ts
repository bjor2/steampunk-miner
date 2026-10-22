/**
 * Read-only debug actions (feature-slices.md 3.14), so e2e specs and balance probes can ask the
 * catalogue for a type and the lead weights without mining one:
 * `steampunkDebug.features.ores.typeOf('crystal', 12)`. `.getPlanetLook()` reads the planet shown
 * now, its row's look and the sky band the kernel draws (ticket 653), for the e2e state assert.
 * `.getPlanetRow()` reads the planet the session is on, as the per-planet fresh-save specs judge
 * it (ticket 656): its name, the pool its kinds resolve to under its ore rules stamp, its row's
 * hazard, and the pocket kinds round the dock in the ground as it stands now.
 */
import type { DebugAction } from '../../debug/debugActionRegistry'
import { drawnSkyBand } from '../../scene/skyBandPresence'
import { readPlanetWorld, useGameStore } from '../../store/gameStore'
import { planetLookOf } from '../../systems/registries/planetRow'
import { pocketKindsNearDock } from './systems/hazardNearDock'
import { poolOfPlanetUnder } from './systems/kindRows'
import { leadWeights, oreFamilies, oreTypeOf } from './systems/oreCatalogue'
import { ORE_ROWS } from './systems/oreRows'
import { hazardOfPlanet } from './systems/planetHazards'
import { nameOfPlanet } from './systems/planetRows'

const BANDS = [1, 2, 3, 4, 5]

function describe() {
  return {
    ok: true as const,
    sliceId: 'ores',
    families: oreFamilies().map((family) => family.id),
    leadWeightsBpByBand: BANDS.map((band) => leadWeights(band)),
  }
}

function typeOf(familyId: unknown, tier: unknown) {
  const isFamily = oreFamilies().some((family) => family.id === familyId)
  if (!isFamily || !Number.isSafeInteger(tier) || (tier as number) < 1) {
    return { ok: false as const, problems: ['typeOf takes a family id and a tier from 1'] }
  }
  return { ok: true as const, ...oreTypeOf(String(familyId), tier as number) }
}

function getPlanetLook() {
  const planet = useGameStore.getState().planetTier
  return {
    ok: true as const,
    planet,
    look: planetLookOf(planet),
    drawnSkyBandColour: drawnSkyBand()?.look.colour ?? null,
  }
}

function getPlanetRow() {
  const { params, world } = readPlanetWorld()
  if (params === null) return { ok: false as const, problems: ['the session is on no planet'] }
  const hazard = hazardOfPlanet(ORE_ROWS.planets, params.planetIndex)
  return {
    ok: true as const,
    planet: params.planetIndex,
    name: nameOfPlanet(ORE_ROWS.planets, params.planetIndex),
    pool: poolOfPlanetUnder(ORE_ROWS.kinds, params.planetIndex, params.oreRulesVersion),
    hazard: hazard === null ? null : { kind: hazard.kind, tag: hazard.tag },
    pocketKindsNearDock: pocketKindsNearDock(params, world),
  }
}

export const oresDebugActions: Readonly<Record<string, DebugAction>> = {
  describe,
  typeOf,
  getPlanetLook,
  getPlanetRow,
}
