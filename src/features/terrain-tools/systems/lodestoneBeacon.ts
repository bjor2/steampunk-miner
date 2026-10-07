/**
 * The lodestone beacon (#162 section 1 row, 3.1, 4.3): it **gathers**. The miner plants it where it
 * stands; at the owner's next dock the beacon draws the common ore within its gather radius into a
 * dense vein beside it, a delayed seeded edit keyed to the planting tick. The farthest nodules
 * trade places with the free ground nearest the beacon, so ore only ever moves inward and none is
 * made or lost. At most 256 swaps per beacon, which the K6 queue spreads at most 64 a tick, so the
 * gather never lands in one tick (TD caps, #162 section 3).
 *
 * One live beacon per planet: planting a second while one waits is refused at no cost. Planting
 * changes no cell, so no gate ever blocks it; gated and core cells never move in the gather.
 */
import type { AuthorityState } from '../../../systems/authority/authorityState'
import { unchanged, type RuleEffect } from '../../../systems/authority/commandRule'
import { planetParamsOf } from '../../../systems/authority/planetOfState'
import type { AuthorityReaction } from '../../../systems/registries/authorityReactions'
import type { TilePoint } from '../../../systems/world/tileGrid'
import type { PowerUpOutcome, PowerUpUse } from '../../power-up-core'
import { canAfford, draftMove, MOVE_UNITS, openDraft, type EditDraft } from './editDraft'
import { distanceSqOf, tilesFarthestFirst, tilesNearestFirst } from './editGeometry'
import { editSeedOf } from './editSeed'
import { canHoldOre, isLooseOre, materialNow, openGroundView, type GroundView } from './groundView'
import { magnitudeAt, MARK_IN_PLAY, terrainItemNamed } from './itemMagnitude'
import { balanceOf } from './terrainItems'
import { beaconPlantedOf, TERRAIN_REFUSAL } from './terrainEvents'
import { editSourceOf, queueEditOf } from './terrainOutcome'
import { terrainToolsOf, withBeacon, type LodestoneBeacon } from './terrainSection'

export const LODESTONE_BEACON_ID = 'consumable.lodestone_beacon'

/** "Applied at dock" (#162 section 3.1): the owner's `DockEntered` gathers its beacon's vein. */
export const LODESTONE_DOCK_REACTION: AuthorityReaction = {
  id: 'terrain-tools.lodestone-dock',
  react: (_before, after, heard) => {
    const docked = heard.find((event) => event.type === 'DockEntered')
    if (docked?.playerId === undefined) return unchanged(after)
    return gatherAtDock(after, docked.playerId)
  },
}

/** Plants the beacon at the miner's tile; a second live beacon on this planet is refused. */
export function plantLodestone(state: AuthorityState, use: PowerUpUse): PowerUpOutcome {
  const planetIndex = planetParamsOf(state.planet)?.planetIndex ?? null
  if (planetIndex === null) return { kind: 'refused', reason: TERRAIN_REFUSAL.outOfPlay }
  if (isBeaconLiveOn(state, use.playerId, planetIndex))
    return { kind: 'refused', reason: TERRAIN_REFUSAL.beaconLive }
  const beacon = { ...use.origin, planetIndex, plantedTick: use.tick, mark: MARK_IN_PLAY }
  return {
    kind: 'acted',
    effect: {
      state: withBeacon(state, use.playerId, beacon),
      events: [beaconPlantedOf(use.playerId, beacon.tx, beacon.ty, beacon.plantedTick)],
    },
  }
}

/**
 * The owner's dock: a beacon on this planet gathers its vein onto the queue and is spent; one left
 * on another planet is dropped. With no beacon nothing changes.
 */
export function gatherAtDock(state: AuthorityState, playerId: string): RuleEffect {
  const { beacon } = terrainToolsOf(state, playerId)
  if (beacon === null) return unchanged(state)
  const spent = withBeacon(state, playerId, null)
  const view = openGroundView(spent, playerId, editSourceOf(LODESTONE_BEACON_ID))
  if (view === null || view.params.planetIndex !== beacon.planetIndex) return unchanged(spent)
  const cells = planLodestoneGather(view, beacon)
  if (cells.length === 0) return unchanged(spent)
  const author = { playerId, itemId: LODESTONE_BEACON_ID, mark: beacon.mark, origin: beacon }
  return queueEditOf(spent, author, cells)
}

/** The gather's swaps: farthest nodules first, each onto the nearest free ground still closer. */
export function planLodestoneGather(view: GroundView, beacon: LodestoneBeacon) {
  const item = terrainItemNamed(LODESTONE_BEACON_ID)
  const centre = { tx: beacon.tx, ty: beacon.ty }
  const radius = magnitudeAt(item, beacon.mark)
  const key = { origin: centre, tick: beacon.plantedTick, itemId: item.itemId, mark: beacon.mark }
  const seed = editSeedOf(view.params, key)
  const draft = openDraft(view, balanceOf(item).swapCap ?? 0)
  const nodules = tilesFarthestFirst(centre, radius, seed).filter((tile) => isLooseOre(view, tile))
  drawInward(draft, centre, nodules, tilesNearestFirst(centre, radius, seed))
  return draft.cells
}

/** Pairs each nodule, farthest first, with the nearest ground left; stops once none is closer. */
function drawInward(
  draft: EditDraft,
  centre: TilePoint,
  nodules: readonly TilePoint[],
  slots: readonly TilePoint[],
): void {
  let next = 0
  for (const nodule of nodules) {
    if (!canAfford(draft, MOVE_UNITS)) return
    const ore = materialNow(draft.view, nodule)
    while (next < slots.length && !canHoldOre(draft.view, slots[next], ore)) next += 1
    if (next === slots.length || !isCloser(centre, slots[next], nodule)) return
    draftMove(draft, nodule, slots[next])
    next += 1
  }
}

function isCloser(centre: TilePoint, slot: TilePoint, nodule: TilePoint): boolean {
  return distanceSqOf(slot, centre) < distanceSqOf(nodule, centre)
}

function isBeaconLiveOn(state: AuthorityState, playerId: string, planetIndex: number): boolean {
  return terrainToolsOf(state, playerId).beacon?.planetIndex === planetIndex
}
