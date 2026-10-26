/**
 * The terrain material's casing blink uniforms (CG2, ticket 830, `terrainShader.ts` "Casing
 * blink"): the blocks the collapse telegraph lists, each with how red its lining is this frame
 * (`casingBlink.ts`), in render-local metres (ticket 339). Read every frame from the authority
 * replica like the telegraph, never through React; the ONLY writer of `uBlinkBlocks`, `uBlinkCount`
 * and `uBlinkRed`. The slots are reused, so a frame allocates nothing; what was written is kept in
 * `casingBlinkPresence` for the debug reads.
 */
import { Vector3, Vector4, type IUniform, type ShaderMaterial } from 'three'
import { CASING_BLINK_BLOCKS, CASING_BLINK_RED } from '../constants/scene'
import { readCollapse, readFrozenTicksLeft } from '../store/collapseReads'
import { useGameStore } from '../store/gameStore'
import { blinkShareOf } from '../systems/render/casingBlink'
import { rgbOfHex } from '../systems/render/colour'
import {
  createTelegraphSlots,
  writeTelegraphBlocks,
  type TelegraphBlock,
} from '../systems/render/collapseTelegraph'
import type { Vector2 } from '../systems/vehicle/localFrame'

/** The blocks blinking now, planet metres, and whether reduce motion holds them steady. */
export const casingBlinkPresence: {
  slots: TelegraphBlock[]
  count: number
  isMotionReduced: boolean
} = { slots: createTelegraphSlots(CASING_BLINK_BLOCKS), count: 0, isMotionReduced: false }

export function createCasingBlinkUniforms(): Record<string, IUniform> {
  return {
    uBlinkBlocks: { value: Array.from({ length: CASING_BLINK_BLOCKS }, () => new Vector4()) },
    uBlinkCount: { value: 0 },
    uBlinkRed: { value: new Vector3(...rgbOfHex(CASING_BLINK_RED)) },
  }
}

export function fitCasingBlinkToCollapse(material: ShaderMaterial, renderOrigin: Vector2): void {
  const { collapse, tick } = readCollapse()
  const presence = casingBlinkPresence
  presence.count = writeTelegraphBlocks(presence.slots, collapse, tick, readFrozenTicksLeft)
  presence.isMotionReduced = !useGameStore.getState().prefs.shake
  writeBlinkUniforms(material, presence, renderOrigin)
}

function writeBlinkUniforms(
  material: ShaderMaterial,
  presence: typeof casingBlinkPresence,
  renderOrigin: Vector2,
): void {
  const blocks: Vector4[] = material.uniforms.uBlinkBlocks.value
  for (let at = 0; at < presence.count; at++) {
    const block = presence.slots[at]
    const share = blinkShareOf(block.elapsedTicks, block.holdTicks, presence.isMotionReduced)
    blocks[at].set(block.x0 - renderOrigin.x, block.y0 - renderOrigin.y, block.size, share)
  }
  material.uniforms.uBlinkCount.value = presence.count
}
