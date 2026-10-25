/**
 * The terrain material's look table (ticket 450, `terrainKindShader.ts`): the `kindLook`
 * provider's species looks for the planet's roster slots, each drawn in its own skin from the
 * first frame, with the rarity of a species the local player has not met left off (GD ruling on
 * #698, option 2, which splits Horizontal Scaler's condition a on #450), and the rarity tints.
 * The ONLY writer of `uKindLooks`, `uRarityLooks` and `uGemCuts` (ticket 889: where the resident
 * atlas's hue-tinted gem-cut pages begin and the planet's gem overlay, from the provider). It
 * rewrites them only when the planet, the player's slice sections (where sightings are kept),
 * `codex.materialContact` (ticket 547), the resident hero atlas (ticket 451: a seen hero with a
 * cell there draws its sprite) or the debug show-all switch change, so a frame allocates nothing
 * and a reveal rebuilds no chunk.
 */
import { Vector4, type IUniform, type ShaderMaterial } from 'three'
import { readAuthorityState } from '../store/authorityLink'
import { useGameStore } from '../store/gameStore'
import type { AuthorityState } from '../systems/authority/authorityState'
import { flagsOf } from '../systems/authority/devFlagState'
import { gemCutsLookOf, gemCutsVectorOf, type GemCutsLook } from '../systems/render/gemCutsLook'
import { hasSeenSpecies } from '../systems/render/speciesSighting'
import { kindLookProvider, type KindLookProvider } from '../systems/registries/kindLook'
import {
  emptyKindLookTable,
  KIND_LOOK_SLOTS,
  kindLookTableOf,
  LOOK_VECTOR,
  RARITY_LOOK_LEADS,
  type KindLook,
  type KindLookTable,
} from '../systems/render/kindLookTable'
import type { PlanetParams } from '../systems/world/planetParams'
import { heroAtlasPresence } from './heroAtlasPresence'
import { kindLookPresence } from './kindLookPresence'

export function createKindLookUniforms(): Record<string, IUniform> {
  return {
    uKindLooks: { value: Array.from({ length: KIND_LOOK_SLOTS }, () => new Vector4()) },
    uRarityLooks: { value: Array.from({ length: RARITY_LOOK_LEADS }, () => new Vector4()) },
    uGemCuts: { value: new Vector4() },
  }
}

/** What the table was last written from. */
interface FittedLooks {
  params: PlanetParams
  sightings: unknown
  /** `codex.materialContact` (ticket 547): off, no species shows its rarity. */
  isContactShown: boolean
  heroCells: ReadonlyMap<string, number>
  firstHueTintedCell: number | null
  isEveryKindShown: boolean
}

const FITTED = new WeakMap<ShaderMaterial, FittedLooks>()

export function fitKindLooksToViewer(material: ShaderMaterial, params: PlanetParams): void {
  const state = readAuthorityState()
  const { playerId } = useGameStore.getState()
  const sightings = sightingsOf(state, playerId)
  const isContactShown = flagsOf(state)['codex.materialContact']
  if (isFittedTo(FITTED.get(material), params, sightings, isContactShown)) return
  FITTED.set(material, fitOf(params, sightings, isContactShown))
  const table = kindLookTableFor(state, playerId, params)
  const gemCuts = gemCutsLookFor(params)
  writeLookTable(material.uniforms, table)
  writeGemCuts(material.uniforms, gemCuts)
  kindLookPresence.table = table
  kindLookPresence.gemCuts = gemCuts
}

/** Sightings are player sections (the codex): the record is replaced only when one is written. */
function sightingsOf(state: AuthorityState, playerId: string): unknown {
  return state.players[playerId]?.slices
}

/** Compared field by field, so an unchanged frame allocates nothing. */
function isFittedTo(
  last: FittedLooks | undefined,
  params: PlanetParams,
  sightings: unknown,
  isContactShown: boolean,
) {
  return (
    last !== undefined &&
    last.params === params &&
    last.sightings === sightings &&
    last.isContactShown === isContactShown &&
    last.heroCells === heroAtlasPresence.heroCells &&
    last.firstHueTintedCell === heroAtlasPresence.firstHueTintedCell &&
    last.isEveryKindShown === kindLookPresence.isEveryKindShown
  )
}

function fitOf(params: PlanetParams, sightings: unknown, isContactShown: boolean): FittedLooks {
  return {
    params,
    sightings,
    isContactShown,
    heroCells: heroAtlasPresence.heroCells,
    firstHueTintedCell: heroAtlasPresence.firstHueTintedCell,
    isEveryKindShown: kindLookPresence.isEveryKindShown,
  }
}

/** Where the resident hue-tinted pages begin and the planet's overlay (ticket 889). */
function gemCutsLookFor(params: PlanetParams): GemCutsLook {
  const overlay = kindLookProvider()?.gemOverlayOf(params) ?? null
  return gemCutsLookOf(heroAtlasPresence.firstHueTintedCell, overlay)
}

function kindLookTableFor(
  state: AuthorityState,
  playerId: string,
  params: PlanetParams,
): KindLookTable {
  const provider = kindLookProvider()
  if (provider === null) return emptyKindLookTable()
  return kindLookTableOf(
    provider.kindLooksOf(params),
    provider.rarityLooks(),
    (look) => isRaritySeenBy(provider, state, playerId, look),
    heroAtlasPresence.heroCells,
  )
}

function isRaritySeenBy(
  provider: KindLookProvider,
  state: AuthorityState,
  playerId: string,
  look: KindLook,
): boolean {
  if (kindLookPresence.isEveryKindShown) return true
  return hasSeenSpecies(state, playerId, provider, look.speciesId)
}

function writeLookTable(uniforms: ShaderMaterial['uniforms'], table: KindLookTable): void {
  writeVectors(uniforms.uKindLooks.value, table.kinds)
  writeVectors(uniforms.uRarityLooks.value, table.rarity)
}

function writeGemCuts(uniforms: ShaderMaterial['uniforms'], gemCuts: GemCutsLook): void {
  ;(uniforms.uGemCuts.value as Vector4).fromArray(gemCutsVectorOf(gemCuts))
}

function writeVectors(vectors: Vector4[], values: Float32Array): void {
  vectors.forEach((vector, at) => vector.fromArray(values, at * LOOK_VECTOR))
}
