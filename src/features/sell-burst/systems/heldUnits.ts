/**
 * The local player's units into the hold in one batch, as the receipt names them (ticket 717):
 * the species the drill's cell wears (`planetSpeciesOf`, read as the pickup popup reads it,
 * ticket 695), its rarity once seen (`seenRarityOfFind`, ticket 454), else the ore type's name.
 * The drill raises its broken cell's `TileDestroyed`, with no cause, just before the unit's
 * `CargoAdded`; a blast's or a bore's units name no cell, so they show the ore type alone. The
 * yielded cell keeps its material after its unit is paid, so the state the batch answered still
 * names it. Look only: the cargo, the price and the sale never read it.
 */
import { vehicleOf, type AuthorityState } from '../../../systems/authority/authorityState'
import type { DomainEvent } from '../../../systems/authority/domainEvent'
import { planetParamsOf } from '../../../systems/authority/planetOfState'
import { oreSalePrice, oreTier } from '../../../systems/economy/oreEconomy'
import { cmp, fromCanonical } from '../../../systems/money'
import { oreTypeCatalogue, type OreType } from '../../../systems/registries/oreTypes'
import { seenRarityOfFind } from '../../../systems/render/seenRarity'
import { bandOfTile } from '../../../systems/world/planetGeometry'
import type { PlanetParams } from '../../../systems/world/planetParams'
import { CELL_KIND, kindOfCell, kindSlotOfCell } from '../../../systems/world/worldCell'
import { materialCellAt } from '../../../systems/world/worldState'
import type { Material } from '../../materials'
import { planetSpeciesOf } from '../../roster'
import type { HeldUnit } from './heldManifest'

type CargoAdded = Extract<DomainEvent, { type: 'CargoAdded' }>
type TileDestroyed = Extract<DomainEvent, { type: 'TileDestroyed' }>

/** What a batch's units are read against: the state it answered and the planet's ore types. */
interface UnitReading {
  state: AuthorityState
  playerId: string
  params: PlanetParams | null
  ores: readonly OreType[]
}

/** Whether the batch put a unit into this player's hold: most batches put none. */
export function hasUnitFor(events: readonly DomainEvent[], playerId: string): boolean {
  return events.some((event) => isUnitFor(event, playerId))
}

export function heldUnitsOf(
  events: readonly DomainEvent[],
  state: AuthorityState,
  playerId: string,
): HeldUnit[] {
  if (!hasUnitFor(events, playerId)) return []
  const reading = readingOf(state, playerId)
  return events.flatMap((event, at) =>
    isUnitFor(event, playerId)
      ? [heldUnitOf(event, drilledCellBefore(events[at - 1]), reading)]
      : [],
  )
}

function readingOf(state: AuthorityState, playerId: string): UnitReading {
  return { state, playerId, params: planetParamsOf(state.planet), ores: oreTypeCatalogue() }
}

function heldUnitOf(added: CargoAdded, cell: TileDestroyed | null, reading: UnitReading): HeldUnit {
  const tier = heldTierOf(added, reading.state, reading.playerId)
  const named = cell === null ? null : speciesUnitOf(added, cell, tier, reading)
  return named ?? oreUnitOf(added, tier, reading)
}

function speciesUnitOf(
  added: CargoAdded,
  cell: TileDestroyed,
  tier: number,
  reading: UnitReading,
): HeldUnit | null {
  const species = speciesAt(cell, reading)
  if (species === null) return null
  const rarity = rarityAt(added, cell, reading)
  return { tier, key: `species:${species.id}`, name: species.name, rarity }
}

function oreUnitOf(added: CargoAdded, tier: number, reading: UnitReading): HeldUnit {
  const ore = reading.ores.find((type) => type.id === added.oreId)
  if (ore === undefined) return { tier, key: `tier:${tier}`, name: null, rarity: null }
  return { tier, key: `ore:${ore.id}`, name: ore.name, rarity: null }
}

/**
 * The tier the hold keeps the unit at: the pickup may hold it at its sale tier or its band's
 * (#232, ticket 509), which `CargoAdded` does not name, but its `value` is that tier's unit price,
 * so it is the held tier whose unit sells for exactly that.
 */
function heldTierOf(added: CargoAdded, state: AuthorityState, playerId: string): number {
  const value = fromCanonical(added.value)
  if (cmp(oreSalePrice(added.resourceTier), value) === 0) return added.resourceTier
  const held = Object.keys(vehicleOf(state, playerId).cargo.ore).map(Number)
  return held.find((tier) => cmp(oreSalePrice(tier), value) === 0) ?? added.resourceTier
}

function speciesAt(cell: TileDestroyed, reading: UnitReading): Material | null {
  if (reading.params === null) return null
  const material = materialCellAt(reading.state.world, reading.params, cell)
  if (kindOfCell(material) !== CELL_KIND.ore) return null
  return planetSpeciesOf(reading.params, kindSlotOfCell(material))
}

/** The cell's tier over its band's own ore, named once the player has seen that rarity. */
function rarityAt(added: CargoAdded, cell: TileDestroyed, reading: UnitReading) {
  const params = reading.params
  if (params === null) return null
  const band = bandOfTile(params, cell.tx, cell.ty)
  const lead = added.resourceTier - oreTier(params.planetIndex, band)
  return lead < 0 ? null : seenRarityOfFind(reading.state, reading.playerId, params, lead)
}

function isUnitFor(event: DomainEvent, playerId: string): event is CargoAdded {
  return event.type === 'CargoAdded' && event.playerId === playerId
}

/** The drill's broken cell when `previous` is it, as the codex pairs a unit with its cell. */
function drilledCellBefore(previous: DomainEvent | undefined): TileDestroyed | null {
  const isDrillBroken = previous?.type === 'TileDestroyed' && previous.cause === undefined
  return isDrillBroken ? previous : null
}
