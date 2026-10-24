/**
 * The looks of a generated pool's kinds (ticket 777, spec #774): a silhouette and a pattern the
 * terrain shader draws (the kernel's `kindLooks.json`, procedural, no new art: the HS on #746) and
 * a hue slot of the materials table, whose slots already keep out of the reserved hue bands and
 * above the brightest host rock.
 *
 * - **Never a recolour.** A kind's silhouette + pattern pair is one no first-system species wears,
 *   so a pool can never be the first system's species with a new hue (HS: fail on recolour).
 * - **Readable apart.** Within a planet every kind has its own silhouette, pattern and hue slot
 *   (#139 GD ruling: every species its own look at phone size); within a system no two kinds share a
 *   pair, so two planets of one system never show the same ore.
 *
 * Each pick walks its list from a seeded start, the planet's address seed under the pick's stream
 * and the kind's index (`rosterDraws.ts`), to the first entry still free, so the looks are a function
 * of the world seed, the address and the kind counts alone.
 */
import { KIND_LOOKS } from '../../../systems/render/kindLooks'
import { MATERIALS } from '../../materials'
import { ROSTER_STREAM, rosterDrawOf, type RosterStream } from './rosterDraws'

export interface KindLook {
  silhouette: string
  pattern: string
  hueSlot: string
}

export interface PoolLookCatalogue {
  silhouettes: readonly string[]
  patterns: readonly string[]
  hueSlots: readonly string[]
  /** The pairs the first system's species wear, as `pairKeyOf` keys. */
  firstSystemPairs: ReadonlySet<string>
}

interface KindDraw {
  worldSeed: number
  system: bigint
  planet: number
  index: number
}

export const POOL_LOOK_CATALOGUE: PoolLookCatalogue = {
  silhouettes: KIND_LOOKS.silhouettes.map((silhouette) => silhouette.id),
  patterns: KIND_LOOKS.patterns.map((pattern) => pattern.id),
  hueSlots: MATERIALS.hueSlots.map((slot) => slot.id),
  firstSystemPairs: new Set(
    MATERIALS.materials.map((species) => pairKeyOf(species.silhouette, species.pattern)),
  ),
}

export function pairKeyOf(silhouette: string, pattern: string): string {
  return `${silhouette}/${pattern}`
}

/** The looks of a system's pools in place order: `kindCounts[at]` kinds on planet `at + 1`. */
export function systemKindLooksOf(
  worldSeed: number,
  system: bigint,
  kindCounts: readonly number[],
  catalogue: PoolLookCatalogue = POOL_LOOK_CATALOGUE,
): KindLook[][] {
  const takenPairs = new Set(catalogue.firstSystemPairs)
  return kindCounts.map((count, at) =>
    planetKindLooksOf(
      { worldSeed, system, planet: at + 1, index: 0 },
      count,
      catalogue,
      takenPairs,
    ),
  )
}

/** One planet's looks; each pair it takes joins `takenPairs` for the planets after it. */
function planetKindLooksOf(
  planetDraw: KindDraw,
  count: number,
  catalogue: PoolLookCatalogue,
  takenPairs: Set<string>,
): KindLook[] {
  const looks: KindLook[] = []
  for (let index = 0; index < count; index += 1) {
    const look = freeLookOf({ ...planetDraw, index }, catalogue, looks, takenPairs)
    looks.push(look)
    takenPairs.add(pairKeyOf(look.silhouette, look.pattern))
  }
  return looks
}

function freeLookOf(
  draw: KindDraw,
  catalogue: PoolLookCatalogue,
  planetLooks: readonly KindLook[],
  takenPairs: ReadonlySet<string>,
): KindLook {
  const silhouette = walkToFree(catalogue.silhouettes, startOf(draw, 'kindSilhouette'), (id) =>
    planetLooks.every((look) => look.silhouette !== id),
  )
  const pattern = walkToFree(
    catalogue.patterns,
    startOf(draw, 'kindPattern'),
    (id) =>
      planetLooks.every((look) => look.pattern !== id) &&
      !takenPairs.has(pairKeyOf(silhouette, id)),
  )
  const hueSlot = walkToFree(catalogue.hueSlots, startOf(draw, 'kindHue'), (id) =>
    planetLooks.every((look) => look.hueSlot !== id),
  )
  return { silhouette, pattern, hueSlot }
}

function startOf(draw: KindDraw, stream: keyof typeof ROSTER_STREAM): number {
  const streamId: RosterStream = ROSTER_STREAM[stream]
  return rosterDrawOf(draw.worldSeed, draw.system, draw.planet, streamId, draw.index)
}

/** The first free entry from `start`, wrapping; throws when the whole list is taken. */
function walkToFree(
  list: readonly string[],
  start: number,
  isFree: (id: string) => boolean,
): string {
  for (let step = 0; step < list.length; step += 1) {
    const id = list[(start + step) % list.length]
    if (isFree(id)) return id
  }
  throw new RangeError('every look in the list is taken')
}
