/**
 * The gates' sounds (ticket 238; #142 "At contact", the Game Director's gate feedback on #151):
 * which of the slice's cues a stop at a gated cell plays, by gate kind and extractor, and the
 * flourish of a freed one. Pure presentation rules; the slice's store hands the cue ids to the
 * kernel's `requestSoundCue`, and the kernel's sound stage keeps each cue to its one voice.
 *
 * A held drill stops at the same cell many times, so a stop at the cell last sounded stays quiet
 * for `repeatTicks`; a different cell sounds at once. A batch that freed cells plays one flourish.
 */
import type { CueWave, SoundCue } from '../../../../systems/registries/soundCues'
import GATE_SOUNDS_FILE from '../../gateSounds.json'
import type { GateHitAt } from '../gateChipBoard'
import { rigNamed } from '../rigs'

export interface GateSounds {
  repeatTicks: number
  drillCue: string
  dynamiteCue: string
  clearedCue: string
  /** The deflection tone of a cell refused for want of its extractor, or while it works. */
  extractorCues: Readonly<Record<string, string>>
  /** A cell whose ore was lost, by how it went. */
  lostCues: Readonly<Record<string, string>>
  cues: readonly SoundCue[]
}

/** The last stop that sounded: its cell, as `tx,ty`, and its tick. */
export interface GateSoundMemory {
  cellKey: string | null
  tick: number
}

export interface GateSoundPlan {
  cueIds: string[]
  memory: GateSoundMemory
}

export const GATE_SOUNDS: GateSounds = gateSoundsOf(GATE_SOUNDS_FILE)

export const QUIET_GATE_SOUND_MEMORY: GateSoundMemory = { cellKey: null, tick: 0 }

/** The cues one batch plays: each stop that may sound, in order, then a flourish if it freed any. */
export function gateSoundPlanOf(
  hits: readonly GateHitAt[],
  hasCleared: boolean,
  memory: GateSoundMemory,
  sounds: GateSounds = GATE_SOUNDS,
): GateSoundPlan {
  const heard = hits.reduce((plan, hit) => planAfterHit(plan, hit, sounds), {
    cueIds: [] as string[],
    memory,
  })
  return hasCleared ? { ...heard, cueIds: [...heard.cueIds, sounds.clearedCue] } : heard
}

/** The cue a stop plays, or null for a gate kind or extractor this slice has no sound for. */
export function cueOfGateHit(hit: GateHitAt, sounds: GateSounds = GATE_SOUNDS): string | null {
  if (hit.gateKind === 'drill') return sounds.drillCue
  if (hit.gateKind === 'dynamite') return sounds.dynamiteCue
  return hit.gateKind === 'rig' ? extractorCueOf(hit, sounds) : null
}

function planAfterHit(plan: GateSoundPlan, hit: GateHitAt, sounds: GateSounds): GateSoundPlan {
  const cueId = cueOfGateHit(hit, sounds)
  if (cueId === null || isRepeatOfLast(plan.memory, hit, sounds)) return plan
  return { cueIds: [...plan.cueIds, cueId], memory: { cellKey: cellKeyOf(hit), tick: hit.tick } }
}

function isRepeatOfLast(memory: GateSoundMemory, hit: GateHitAt, sounds: GateSounds): boolean {
  return memory.cellKey === cellKeyOf(hit) && hit.tick - memory.tick < sounds.repeatTicks
}

function extractorCueOf(hit: GateHitAt, sounds: GateSounds): string | null {
  const rigId = hit.required.split(':')[0]
  const lostAs = rigNamed(rigId)?.lostAs ?? null
  if (hit.outcome === 'lost' && lostAs !== null) return sounds.lostCues[lostAs] ?? null
  return sounds.extractorCues[rigId] ?? null
}

function cellKeyOf({ tx, ty }: GateHitAt): string {
  return `${tx},${ty}`
}

function gateSoundsOf(file: typeof GATE_SOUNDS_FILE): GateSounds {
  const cues = file.cues.map((cue) => ({
    ...cue,
    tone: {
      ...cue.tone,
      partials: cue.tone.partials.map((partial) => ({ ...partial, wave: partial.wave as CueWave })),
    },
  }))
  return { ...file, cues }
}
