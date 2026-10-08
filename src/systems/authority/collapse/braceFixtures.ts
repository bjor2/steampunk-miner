/**
 * A fake bracing slice for the collapse brace specs (ticket 331), registered through
 * `withRegistrations` so no real slice is imported. It braces the blocks its own session section
 * names, the way the lode clamp (#285) will: a `brace-probe.brace` command writes the section,
 * `brace-probe.release` clears it, and its clock step clears it at `endTick`. The provider answers
 * from `fromTick` on, each claim ending at `untilTick` (null: open-ended).
 *
 * `leaveAtEnd` has the clock step also carry p1 40 m east as it ends the brace, standing in for a
 * tow on the brace's last tick, so the block no longer holds when the brace is seen to end.
 */
import type { SliceDefinition, SliceRegistrar } from '../../../registries/sliceDefinition'
import type { CollapseBraceProvider } from '../../registries/collapseBraces'
import { readSection, withSection, type SaveSection } from '../../registries/saveSections'
import type { CommandIntent } from '../authorityCommand'
import type { AuthorityState } from '../authorityState'
import { unchanged, type RuleEffect } from '../commandRule'
import { isFeatureUnlocked } from '../featureUnlocks'

declare module '../authorityCommand' {
  interface CommandPayloads {
    /** `untilTick` and `endTick` -1 for none. */
    'brace-probe.brace': {
      blocks: string[]
      fromTick: number
      untilTick: number
      endTick: number
      leaveAtEnd: boolean
    }
    'brace-probe.release': Record<string, never>
  }
}

interface BraceProbe {
  blocks: readonly string[]
  fromTick: number
  untilTick: number | null
  endTick: number | null
  leaveAtEnd: boolean
}

const NO_BRACE: BraceProbe = {
  blocks: [],
  fromTick: 0,
  untilTick: null,
  endTick: null,
  leaveAtEnd: false,
}

const LEAVE_MM = 40000

const BRACE_SECTION: SaveSection<BraceProbe> = {
  id: 'brace-probe',
  version: 1,
  scope: 'session',
  initial: NO_BRACE,
  problems: () => [],
  toPortable: (value) => ({ ...value, blocks: [...value.blocks] }),
  ofPortable: (body) => body as BraceProbe,
}

export interface BraceOptions {
  fromTick?: number
  untilTick?: number
  endTick?: number
  leaveAtEnd?: boolean
}

/** Braces `blocks` from the command's tick on, until it is released or an end option comes. */
export function braceCommand(
  blocks: readonly string[],
  options: BraceOptions = {},
): CommandIntent<'brace-probe.brace'> {
  return {
    type: 'brace-probe.brace',
    payload: {
      blocks: [...blocks],
      fromTick: options.fromTick ?? 0,
      untilTick: options.untilTick ?? -1,
      endTick: options.endTick ?? -1,
      leaveAtEnd: options.leaveAtEnd ?? false,
    },
  }
}

export const RELEASE_BRACE: CommandIntent<'brace-probe.release'> = {
  type: 'brace-probe.release',
  payload: {},
}

/** The probe slice; `providerIds` registers one provider per id, all reading the same section. */
export function braceProbeSlice(providerIds: readonly string[] = ['brace-probe.clamp']) {
  return sliceOf((r) => providerIds.forEach((id) => r.collapseBrace(providerOf(id))))
}

/**
 * The same, its provider answering only while the `remote_detonator` row (planet 22) is open, as
 * a real provider answers only while its item is owned or its row unlocked.
 */
export function gatedBraceProbeSlice(): SliceDefinition {
  const open = providerOf('brace-probe.gated')
  return sliceOf((r) =>
    r.collapseBrace({
      id: open.id,
      bracesAt: (state, tick) =>
        isFeatureUnlocked(state, 'remote_detonator') ? open.bracesAt(state, tick) : [],
    }),
  )
}

function sliceOf(registerProviders: (r: SliceRegistrar) => void): SliceDefinition {
  return {
    id: 'brace-probe',
    register(r) {
      r.saveSection(BRACE_SECTION)
      r.commandRules({
        'brace-probe.brace': {
          fields: {
            blocks: 'textList',
            fromTick: 'wholeNumber',
            untilTick: 'safeInteger',
            endTick: 'safeInteger',
            leaveAtEnd: 'flag',
          },
          apply: (state, { payload }) => ({
            state: withSection(state, null, BRACE_SECTION, probeOf(payload)),
            events: [],
          }),
        },
        'brace-probe.release': {
          fields: {},
          apply: (state) => ({
            state: withSection(state, null, BRACE_SECTION, NO_BRACE),
            events: [],
          }),
        },
      })
      r.clockStep({ id: 'brace-probe.end', nextTick: nextEndTickOf, run: endBraceAt })
      registerProviders(r)
    },
  }
}

function probeOf(payload: CommandIntent<'brace-probe.brace'>['payload']): BraceProbe {
  return {
    blocks: payload.blocks,
    fromTick: payload.fromTick,
    untilTick: payload.untilTick < 0 ? null : payload.untilTick,
    endTick: payload.endTick < 0 ? null : payload.endTick,
    leaveAtEnd: payload.leaveAtEnd,
  }
}

function providerOf(id: string): CollapseBraceProvider {
  return {
    id,
    bracesAt: (state, tick) => {
      const probe = readSection(state, null, BRACE_SECTION)
      if (tick < probe.fromTick) return []
      return probe.blocks.map((block) => ({ block, untilTick: probe.untilTick }))
    },
  }
}

function nextEndTickOf(state: AuthorityState): number | null {
  const { endTick } = readSection(state, null, BRACE_SECTION)
  return endTick !== null && endTick > state.tick ? endTick : null
}

function endBraceAt(state: AuthorityState, tick: number): RuleEffect {
  const probe = readSection(state, null, BRACE_SECTION)
  if (probe.endTick === null || tick < probe.endTick) return unchanged(state)
  const ended = withSection(state, null, BRACE_SECTION, NO_BRACE)
  return { state: probe.leaveAtEnd ? withP1Away(ended) : ended, events: [] }
}

function withP1Away(state: AuthorityState): AuthorityState {
  const player = state.players.p1
  const { pose } = player.vehicle
  if (pose === null) return state
  const vehicle = { ...player.vehicle, pose: { ...pose, x: pose.x + LEAVE_MM } }
  return { ...state, players: { ...state.players, p1: { ...player, vehicle } } }
}
