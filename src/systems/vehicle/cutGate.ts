/**
 * The "actively cutting" gate (TD scope 0 on #316, ticket 333): whether the drill sets the rig's
 * speed (the cut-follow) or travel does. It reads the uncut share of the leading slab
 * (`leadingSlab.ts`) before each tick's cut:
 *
 * - closed, it opens on a tick at `CUT_GATE_ON_BP` or more uncut;
 * - open, it closes once `CUT_GATE_HOLD_TICKS` consecutive ticks stay under `CUT_GATE_OFF_BP`;
 * - it never flips again within `CUT_GATE_HOLD_TICKS` of its last flip, so a mixed cave and rock
 *   line flips it at most once in that many ticks.
 *
 * Two small integers, kept on the swept cut's cursor so they are saved and digested only once a
 * `drillStep` has been sent (the dev flag `drill.sweptCut`). A tick with no step (the drill not
 * engaged) counts as one under the off line, so the authority and a client that reads it agree.
 */
import { CUT_GATE_HOLD_TICKS, CUT_GATE_OFF_BP, CUT_GATE_ON_BP } from '../../constants/balance'

export interface CutGate {
  /** 1 while the rig actively cuts, else 0. */
  cutGate: 0 | 1
  /**
   * Open: the consecutive ticks under the off line. Closed: the ticks since it closed. Never past
   * `CUT_GATE_HOLD_TICKS`.
   */
  cutGateLowTicks: number
}

/** Before the first drill step: closed, and free to open on the first fresh ground. */
export const CLOSED_CUT_GATE: CutGate = Object.freeze({
  cutGate: 0,
  cutGateLowTicks: CUT_GATE_HOLD_TICKS,
})

export function isCutGateOpen(gate: CutGate): boolean {
  return gate.cutGate === 1
}

/** The gate after `idleTicks` ticks with no drill step, each one under the off line. */
export function idledCutGate(gate: CutGate, idleTicks: number): CutGate {
  const held = gate.cutGateLowTicks + idleTicks
  if (!isCutGateOpen(gate)) return closedFor(held)
  return held < CUT_GATE_HOLD_TICKS ? openFor(held) : closedFor(held - CUT_GATE_HOLD_TICKS)
}

/** The gate after one tick whose leading slab is `uncutBp` uncut. */
export function nextCutGate(gate: CutGate, uncutBp: number): CutGate {
  return isCutGateOpen(gate) ? nextOpenGate(gate, uncutBp) : nextClosedGate(gate, uncutBp)
}

function nextOpenGate(gate: CutGate, uncutBp: number): CutGate {
  if (uncutBp >= CUT_GATE_OFF_BP) return openFor(0)
  const low = gate.cutGateLowTicks + 1
  return low < CUT_GATE_HOLD_TICKS ? openFor(low) : closedFor(0)
}

function nextClosedGate(gate: CutGate, uncutBp: number): CutGate {
  const since = Math.min(CUT_GATE_HOLD_TICKS, gate.cutGateLowTicks + 1)
  const canOpen = since >= CUT_GATE_HOLD_TICKS
  return uncutBp >= CUT_GATE_ON_BP && canOpen ? openFor(0) : closedFor(since)
}

function openFor(lowTicks: number): CutGate {
  return { cutGate: 1, cutGateLowTicks: lowTicks }
}

function closedFor(ticks: number): CutGate {
  return { cutGate: 0, cutGateLowTicks: Math.min(CUT_GATE_HOLD_TICKS, ticks) }
}
