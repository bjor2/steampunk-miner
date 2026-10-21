import { describe, expect, it } from 'vitest'
import { everyLookFrameOf, type TrackLookFrames } from './render/rigLookFrames'
import { SHIPPED_RIG_LOOKS } from './rigLooks'
import { RIG_LOOK_TABLE } from './rigLookTable'

// The G&V rule on #157 (ticket 590): the drill nose stays the brightest part of the rig. A glow
// lands only on the part slots its group names (`scene/vehicleLookPaint.ts`), so the nose is every
// slot that ever draws in the bit's place: `drill-bit` and each part a look swaps in for it.
const NOSE_SLOT = 'drill-bit'

/** Per part slot, the brightest glow each track can put there, summed over the tracks. */
function brightestGlowBySlot(): Map<string, number> {
  const bySlot = new Map<string, number>()
  for (const frames of SHIPPED_RIG_LOOKS.tracks) {
    frames.rows.glowSlots.forEach((slots, at) => {
      const brightest = brightestGlowOf(frames, at)
      for (const slot of slots) bySlot.set(slot, (bySlot.get(slot) ?? 0) + brightest)
    })
  }
  return bySlot
}

function brightestGlowOf(frames: TrackLookFrames, group: number): number {
  return Math.max(...everyLookFrameOf(frames).map((frame) => frame.glows[group]))
}

/** `drill-bit` and every look part standing in its place. */
function noseSlots(): Set<string> {
  const standIns = RIG_LOOK_TABLE.tracks
    .filter((rows) => rows.replaces === NOSE_SLOT)
    .flatMap((rows) => rows.steps.flatMap((step) => (step.part === null ? [] : [step.part])))
  return new Set([NOSE_SLOT, ...standIns])
}

describe('rig look readability', () => {
  it('keeps every part that draws as the drill nose brighter than the rest at the brightest looks', () => {
    const bySlot = brightestGlowBySlot()
    const nose = noseSlots()
    const rest = [...bySlot].filter(([slot]) => !nose.has(slot))
    const brightestRest = Math.max(...rest.map(([, glow]) => glow))
    const dimNoses = [...nose].filter((slot) => (bySlot.get(slot) ?? 0) <= brightestRest)
    expect({ brightestRest, dimNoses }).toEqual({ brightestRest, dimNoses: [] })
  })

  it("keeps the drill tip's crowns as the nose, standing in the bit's place", () => {
    expect([...noseSlots()].sort()).toEqual(
      [
        'drill-bit',
        'steel-cone',
        'fluted-bit',
        'toothed-crown',
        'gem-set-crown',
        'aether-cut-crown',
      ].sort(),
    )
  })
})
