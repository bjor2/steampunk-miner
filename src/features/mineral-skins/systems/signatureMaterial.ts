/**
 * The signature material a planet's skin row may dress (#576, GD ruling 20 Oct 2026: "a
 * signature-material skin on P3, P4, P5"; ticket 603). From P3 the act's signature family paints
 * its own cells at the band-5 tier `t_5` (#141, planet-mix), the slotless 16th material of #453 E1:
 * no kind slot and no species row, so its skin is keyed by the planet, never by a species. Only a
 * planet a species pool covers (ticket 542) is listed, since its skin must stand apart from the
 * pool's species. Its look today is the family's #151 row (ore-visuals), whose hue and luma bands
 * a signature palette's body keeps.
 */
import { ORE_LOOKS, oreFamilyLookOf, type OreLooks } from '../../ore-visuals'
import { ORE_ROWS, oreTierOf, oreTypeOf } from '../../ores'
import { actOf, isSignatureOre } from '../../planet-mix'

export interface SignatureMaterial {
  planetIndex: number
  /** The planet's species pool, whose skins the signature's must differ from. */
  pool: string
  family: string
  /** The ore type the signature cells hold, `<family>_t<t_5>`. */
  oreTypeId: string
  /** Degrees, from the family's #151 look row. */
  hueBand: readonly [number, number]
  lumaBand: readonly [number, number]
}

/** Band 5 at lead 0: the tier a planet's signature ore has (#141 "Signature"). */
const SIGNATURE_BAND = 5

/** By planet index, every pooled planet that paints a signature. */
export function signatureMaterialsByPlanet(
  poolByPlanet: ReadonlyMap<number, string> = ORE_ROWS.kinds.poolByPlanet,
  looks: OreLooks = ORE_LOOKS,
): Map<number, SignatureMaterial> {
  return new Map(
    [...poolByPlanet].flatMap(([planetIndex, pool]) => {
      const material = signatureMaterialOf(planetIndex, pool, looks)
      return material === null ? [] : [[planetIndex, material] as const]
    }),
  )
}

function signatureMaterialOf(
  planetIndex: number,
  pool: string,
  looks: OreLooks,
): SignatureMaterial | null {
  const family = actOf(planetIndex).signature
  const tier = oreTierOf(planetIndex, SIGNATURE_BAND, 0)
  const look = family === null ? null : oreFamilyLookOf(looks, family)
  if (family === null || look === null || !isSignatureOre(family, tier)) return null
  return {
    planetIndex,
    pool,
    family,
    oreTypeId: oreTypeOf(family, tier).id,
    hueBand: look.hueBand,
    lumaBand: look.lumaBand,
  }
}
