/**
 * The terrain material's gate uniforms that follow the local player (ticket 299,
 * `terrainShader.ts`): their drill tip major, so a rim opens in the ground on the major where its
 * gate opens and a tip buy rebuilds no chunk (the TD's tip-major uniform on #238), and reduce
 * motion, which is the shake switch here as for the vehicle's part motion (#33, #48), holding an
 * extractor's surface motion still as its engraved glyph. The ONLY writer of `uGateTipMajor` and
 * `uGateStill`; it keeps what it wrote in `groundGatePresence` for the debug reads. A frame
 * allocates nothing.
 */
import type { IUniform, ShaderMaterial } from 'three'
import { readAuthorityState } from '../store/authorityLink'
import { useGameStore } from '../store/gameStore'
import { writeGateViewer } from '../systems/render/gatePatterns'
import { groundGatePresence } from './groundGatePresence'

export function createGateViewerUniforms(): Record<string, IUniform> {
  return { uGateTipMajor: { value: 0 }, uGateStill: { value: 0 } }
}

export function fitGateToViewer(material: ShaderMaterial): void {
  const { playerId, prefs } = useGameStore.getState()
  const viewer = writeGateViewer(
    groundGatePresence.viewer,
    readAuthorityState(),
    playerId,
    !prefs.shake,
  )
  material.uniforms.uGateTipMajor.value = viewer.tipMajor
  material.uniforms.uGateStill.value = viewer.isMotionReduced ? 1 : 0
}
