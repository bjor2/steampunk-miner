/**
 * The artefact twists (spec #162 section 1, "Artefact twists", renamed by Content on 8 Oct at the
 * GD's request on the #206 lock; ticket 329 as 206c): a fourth cache card that changes how a lane
 * item plays, offered only once that base item is owned. The ids and iconIds stay the ones
 * `techGear.json` and the fx frames key on; none is an `artefact_set_*` vision row id, and no name
 * is a vision row's (GD decision 4).
 *
 * A twist is the run's one held artefact (GD decision 3): it has no Marks and reads its base item's
 * current values (#162 4.6), so it sits under that item's cap. The lane plays the twist at its own
 * decision point, through the kernel `twist` hook (`twistHooks.ts`); this slice imports no lane.
 */
import type { ArtefactEffect, GateClause } from '../../../systems/artefacts/uniquenessGate'

export interface Twist {
  /** The artefact option id the cache card and the held artefact carry. */
  optionId: string
  /** `<slice>.<name>` of the item hook the base item's lane consults. */
  hookId: string
  /** Title Case: a named artefact (#159 naming ruling). */
  name: string
  /** The cache card's one line: how the base item plays with the twist. */
  summary: string
  /** The flavour line: no digits, at most 80 characters, never "rig" (#162 acceptance 1, 2). */
  description: string
  iconId: string
  /** The lane item it twists; owning it offers the card (#162 acceptance 8). */
  baseItemId: string
  /** The lane slice whose decision point consults the twist. */
  laneId: string
  /** Each twist is a new rule, channel or interaction, never a stat (#46 uniqueness gate). */
  gateClauses: readonly GateClause[]
  effects: readonly ArtefactEffect[]
  /** The base item whose income cap any yield counts toward; absent for a twist that yields none. */
  incomeItemId?: string
}

export const TWISTS: readonly Twist[] = [
  {
    optionId: 'artefact.seismic_ping',
    hookId: 'artefact.deep_striker',
    name: 'Deep Striker',
    summary: "The echo sounder's ping becomes a downward cone that reaches into the band below.",
    description: "A tuned striker sends the sounder's knock straight down into the deep.",
    iconId: 'item-artefact-seismic-ping',
    baseItemId: 'power.echo_sounder',
    laneId: 'sensing',
    gateClauses: ['new_information'],
    effects: [{ kind: 'information_channel', channel: 'echo_cone_below' }],
  },
  {
    optionId: 'artefact.grapple_anchor',
    hookId: 'artefact.belay_line',
    name: 'Belay Line',
    summary: 'The grapple hook stays planted as a standing line that catches you if you fall.',
    description: 'A barbed anchor stays bitten in the rock and holds the miner on a line.',
    iconId: 'item-artefact-grapple-anchor',
    baseItemId: 'power.grapple_winch',
    laneId: 'mobility',
    gateClauses: ['new_rule', 'new_interaction'],
    effects: [
      { kind: 'rule_flag', rule: 'belay_line_catch' },
      { kind: 'interaction', with: 'collapse' },
    ],
  },
  {
    optionId: 'artefact.salvage_magnet',
    hookId: 'artefact.ore_lure',
    name: 'Ore Lure',
    summary: 'The ore-shifter drags toward a magnet plate you leave on the tunnel wall.',
    description: 'A magnet plate left on the wall becomes where the shifter drags its ore.',
    iconId: 'item-artefact-salvage-magnet',
    baseItemId: 'power.ore_shifter',
    laneId: 'terrain-tools',
    gateClauses: ['new_rule', 'new_interaction'],
    effects: [
      { kind: 'rule_flag', rule: 'ore_lure_plate' },
      { kind: 'interaction', with: 'ground' },
    ],
    incomeItemId: 'power.ore_shifter',
  },
]

export function twistOf(optionId: string): Twist | null {
  return TWISTS.find((twist) => twist.optionId === optionId) ?? null
}
