/**
 * The rarity a material shows the local player (ticket 454 under #139; GD ruling 2 on #139: "The
 * assay lens and scanner show a rarity only for materials already seen"). A cell's rarity is its
 * species' tier, asked of the `kindLook` provider, and shows only once the player has met that
 * species (the codex's `material:<species id>` record, ticket 546); an unseen species, a cell with
 * no species (a legacy planet, P8+) and a planet with no provider stay unspecified (null), and so
 * does every species while `codex.materialContact` is off (`speciesSighting.ts`, ticket 547). Look
 * only: no price, sale, gate or income reads it, and it never writes the record.
 */
import type { AuthorityState } from '../authority/authorityState'
import { kindLookProvider, type KindLookProvider } from '../registries/kindLook'
import type { PlanetParams } from '../world/planetParams'
import { CELL_KIND, kindOfCell, kindSlotOfCell, NO_KIND_SLOT } from '../world/worldCell'
import type { Rgb } from './colour'
import { hasSeenSpecies } from './speciesSighting'
import type { KindLook } from './kindLookTable'

export interface SeenRarity {
  /** The tier offset over its band, 0 common to 4 mythic. */
  lead: number
  /** The tier's id as the ores rows name it (`rare`). */
  rarity: string
  /** The ground's rarity tint; null for common, which draws none. */
  tint: Rgb | null
  /** The share of the glow that pulses; 0 for common. */
  pulse: number
}

/** What a live cell may say of its rarity. */
export interface CellRarity {
  /** Whether the cell is ore of a species, so its rarity is a material's and may be hidden. */
  hasSpecies: boolean
  /** Its species' rarity once seen; null while unspecified. */
  seen: SeenRarity | null
}

export type CellRarityOf = (cell: number) => CellRarity

const NO_SPECIES: CellRarity = { hasSpecies: false, seen: null }
const NOTHING_SEEN: CellRarityOf = () => NO_SPECIES
const COMMON_LEAD = 0

/** Reads the planet's species once, so a panel asks it per cell without rebuilding the roster. */
export function cellRarityReaderOf(
  state: AuthorityState,
  playerId: string,
  params: PlanetParams,
): CellRarityOf {
  const provider = kindLookProvider()
  if (provider === null) return NOTHING_SEEN
  const looks = provider.kindLooksOf(params)
  return (cell) => cellRarityOfLook(state, playerId, provider, speciesLookOfCell(looks, cell))
}

/** The rarity tier a lead names as the provider draws it; null past mythic or with no provider. */
export function rarityOfLead(lead: number): SeenRarity | null {
  const provider = kindLookProvider()
  return provider === null ? null : rarityOfLeadBy(provider, lead)
}

/**
 * The rarity of a unit found at `lead` over its band, once the player has seen a species of the
 * planet at that rarity; null otherwise. For a unit whose cell is gone (the popup hears the hold
 * after the step): the drill touched the cell, which recorded its species (ticket 546).
 */
export function seenRarityOfFind(
  state: AuthorityState,
  playerId: string,
  params: PlanetParams,
  lead: number,
): SeenRarity | null {
  const provider = kindLookProvider()
  if (provider === null) return null
  const isSeen = provider
    .kindLooksOf(params)
    .some((look) => isSeenAtLead(state, playerId, provider, look, lead))
  return isSeen ? rarityOfLeadBy(provider, lead) : null
}

function isSeenAtLead(
  state: AuthorityState,
  playerId: string,
  provider: KindLookProvider,
  look: KindLook | null,
  lead: number,
): boolean {
  return look?.rarityLead === lead && hasPlayerSeen(state, playerId, provider, look)
}

function cellRarityOfLook(
  state: AuthorityState,
  playerId: string,
  provider: KindLookProvider,
  look: KindLook | null,
): CellRarity {
  if (look === null) return NO_SPECIES
  const isSeen = hasPlayerSeen(state, playerId, provider, look)
  return { hasSpecies: true, seen: isSeen ? rarityOfLeadBy(provider, look.rarityLead) : null }
}

function hasPlayerSeen(
  state: AuthorityState,
  playerId: string,
  provider: KindLookProvider,
  look: KindLook,
): boolean {
  return hasSeenSpecies(state, playerId, provider, look.speciesId)
}

/** The species an ore cell's kind slot binds; null for any other cell or an unbound slot. */
function speciesLookOfCell(looks: readonly (KindLook | null)[], cell: number): KindLook | null {
  const slot = kindSlotOfCell(cell)
  if (kindOfCell(cell) !== CELL_KIND.ore || slot === NO_KIND_SLOT) return null
  return looks[slot - 1] ?? null
}

function rarityOfLeadBy(provider: KindLookProvider, lead: number): SeenRarity | null {
  const rarity = provider.rarityIdOfLead(lead)
  if (rarity === null) return null
  if (lead === COMMON_LEAD) return { lead, rarity, tint: null, pulse: 0 }
  const look = provider.rarityLooks()[lead - 1]
  return look === undefined ? null : { lead, rarity, tint: look.tint, pulse: look.pulse }
}
