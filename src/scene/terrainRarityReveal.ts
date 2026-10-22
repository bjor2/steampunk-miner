/**
 * The terrain's first-contact flourish (GD ruling on #698, option 2): when the store hears the
 * player meet a species (`speciesRevealBroadcast`), its rarity overlay rises over
 * `RARITY_REVEAL_SECONDS` on every tile of that slot while sparks leave the drill's nose cell; the
 * chime is the feedback cue the store sends with it. The ONLY writer of `uRarityReveal`, which it
 * sets once per flourish on the material's own clock, so a frame allocates nothing and no chunk
 * is rebuilt. Presentation only: no command, no log line, nothing in the digest.
 */
import { Vector4, type IUniform, type ShaderMaterial } from 'three'
import { RARITY_REVEAL_SECONDS, SPECIES_REVEAL_SPARKS } from '../constants/speciesReveal'
import { requestSpray, type SprayRequest } from '../store/sprayRequests'
import type { SpeciesReveal } from '../systems/render/speciesReveal'
import { drillPresence } from './drillPresence'
import { speciesRevealPresence } from './speciesRevealPresence'

/** Slot 0 binds no species, so the rest state raises nothing. */
export function createRarityRevealUniforms(): Record<string, IUniform> {
  return { uRarityReveal: { value: new Vector4(0, 0, RARITY_REVEAL_SECONDS, 0) } }
}

/** One request reused for every flourish: `requestSpray` reads it at once and never keeps it. */
const sparks: SprayRequest = {
  kind: 'spark',
  x: 0,
  y: 0,
  dirX: 0,
  dirY: 1,
  count: SPECIES_REVEAL_SPARKS,
  priority: 'low',
}

/** A `listenForSpeciesReveals` listener. */
export function startRevealFlourish(reveal: SpeciesReveal): void {
  recordReveal(reveal)
  requestSpray(writeNoseSparks(sparks))
}

function recordReveal(reveal: SpeciesReveal): void {
  speciesRevealPresence.fired++
  speciesRevealPresence.lastSlot = reveal.slot
  speciesRevealPresence.lastSpeciesId = reveal.speciesId
}

/** From the centre of the cell at the drill's nose, up the vehicle. */
function writeNoseSparks(out: SprayRequest): SprayRequest {
  out.x = drillPresence.nose.x
  out.y = drillPresence.nose.y
  out.dirX = drillPresence.up.x
  out.dirY = drillPresence.up.y
  return out
}

/**
 * The flourishes each material has seen, so each one starts once on its own clock; a material made
 * after a flourish (a remounted terrain) only notes it, never replays it.
 */
const STARTED = new WeakMap<ShaderMaterial, number>()

export function fitRarityRevealToClock(material: ShaderMaterial): void {
  const started = STARTED.get(material)
  if (started === speciesRevealPresence.fired) return
  STARTED.set(material, speciesRevealPresence.fired)
  if (started !== undefined) startRarityRise(material)
}

function startRarityRise({ uniforms }: ShaderMaterial): void {
  uniforms.uRarityReveal.value.set(
    speciesRevealPresence.lastSlot,
    uniforms.uTime.value,
    RARITY_REVEAL_SECONDS,
    0,
  )
}
