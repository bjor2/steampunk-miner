/**
 * The terrain material's look table (ticket 450, `terrainKindShader.ts`): the `kindLook`
 * provider's species looks for the planet's roster slots, with each slot the local player has not
 * seen left at the family look (Horizontal Scaler's condition a on #450), and the rarity tints.
 * The ONLY writer of `uKindLooks` and `uRarityLooks`. It rewrites them only when the planet, the
 * player's slice sections (where sightings are kept) or the debug show-all switch change, so a
 * frame allocates nothing and a reveal rebuilds no chunk.
 */
import { Vector4, type IUniform, type ShaderMaterial } from 'three'
import { readAuthorityState } from '../store/authorityLink'
import { useGameStore } from '../store/gameStore'
import type { AuthorityState } from '../systems/authority/authorityState'
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
import { kindLookPresence } from './kindLookPresence'

export function createKindLookUniforms(): Record<string, IUniform> {
  return {
    uKindLooks: { value: Array.from({ length: KIND_LOOK_SLOTS }, () => new Vector4()) },
    uRarityLooks: { value: Array.from({ length: RARITY_LOOK_LEADS }, () => new Vector4()) },
  }
}

/** What the table was last written from. */
interface FittedLooks {
  params: PlanetParams
  sightings: unknown
  isEveryKindShown: boolean
}

const FITTED = new WeakMap<ShaderMaterial, FittedLooks>()

export function fitKindLooksToViewer(material: ShaderMaterial, params: PlanetParams): void {
  const state = readAuthorityState()
  const { playerId } = useGameStore.getState()
  const sightings = sightingsOf(state, playerId)
  if (isFittedTo(FITTED.get(material), params, sightings)) return
  FITTED.set(material, fitOf(params, sightings))
  const table = kindLookTableFor(state, playerId, params)
  writeLookTable(material.uniforms, table)
  kindLookPresence.table = table
}

/** Sightings are player sections (the codex): the record is replaced only when one is written. */
function sightingsOf(state: AuthorityState, playerId: string): unknown {
  return state.players[playerId]?.slices
}

/** Compared field by field, so an unchanged frame allocates nothing. */
function isFittedTo(last: FittedLooks | undefined, params: PlanetParams, sightings: unknown) {
  return (
    last !== undefined &&
    last.params === params &&
    last.sightings === sightings &&
    last.isEveryKindShown === kindLookPresence.isEveryKindShown
  )
}

function fitOf(params: PlanetParams, sightings: unknown): FittedLooks {
  return { params, sightings, isEveryKindShown: kindLookPresence.isEveryKindShown }
}

function kindLookTableFor(
  state: AuthorityState,
  playerId: string,
  params: PlanetParams,
): KindLookTable {
  const provider = kindLookProvider()
  if (provider === null) return emptyKindLookTable()
  return kindLookTableOf(provider.kindLooksOf(params), provider.rarityLooks(), (look) =>
    isShownTo(provider, state, playerId, look),
  )
}

function isShownTo(
  provider: KindLookProvider,
  state: AuthorityState,
  playerId: string,
  look: KindLook,
): boolean {
  if (kindLookPresence.isEveryKindShown) return true
  return (
    Object.hasOwn(state.players, playerId) && provider.hasSeenKind(state, playerId, look.speciesId)
  )
}

function writeLookTable(uniforms: ShaderMaterial['uniforms'], table: KindLookTable): void {
  writeVectors(uniforms.uKindLooks.value, table.kinds)
  writeVectors(uniforms.uRarityLooks.value, table.rarity)
}

function writeVectors(vectors: Vector4[], values: Float32Array): void {
  vectors.forEach((vector, at) => vector.fromArray(values, at * LOOK_VECTOR))
}
