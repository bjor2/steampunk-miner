/**
 * What the pacing bot reads of the slices' gates (#142 acceptance 8 and 9, ticket 236) before it
 * bores a tile: the drill's verdict, as the authority's drill will ask it, so a cell the gate
 * leaves standing is a wall to route around and not eight refused bores; and for a dynamite-gated
 * shell, the smallest charge size that frees it whole. A wall the player's own extractor opens by
 * standing by it (a tune, an etch, a pull: ticket 237) says how long after a touch, so the bot
 * waits there instead of routing round. With no gate registered nothing is asked.
 */
import { gateOfTile, type GateAsker } from '../authority/cellGates'
import { chargeRadiusMm, chargeSizeCount, isRemoteSize } from '../economy/chargeSizes'
import { hasGateChecks, isStandingVerdict, type GateVerdict } from '../registries/gateChecks'
import type { BlastEvent } from '../registries/blastEffects'
import type { TilePoint } from '../world/tileGrid'
import type { BotSession } from './botSession'
import { paramsOfSession } from './botWorld'

/** The gate kind #142 names a sealed shell by. */
const SHELL_GATE_KIND = 'dynamite'

/** The drill's gate verdict on the tile, or null when it has none. */
export function drillGateAt(session: BotSession, tile: TilePoint): GateVerdict | null {
  if (!hasGateChecks()) return null
  return gateOfTile(askerOf(session, null), tile)?.verdict ?? null
}

/** A gate the drill cannot pass: refused or blocked. */
export function isWallGate(verdict: GateVerdict | null): boolean {
  return verdict !== null && isStandingVerdict(verdict)
}

/** Ticks the bot stands by a touched wall until its own extractor opens it; null when none does. */
export function extractorWaitOf(verdict: GateVerdict | null): number | null {
  if (verdict === null || !isStandingVerdict(verdict)) return null
  return verdict.opensAfterTicks ?? null
}

/** A dynamite-gated shell: the drill is refused and only a charge frees it. */
export function isShellGate(verdict: GateVerdict | null): boolean {
  return verdict !== null && verdict.outcome === 'refused' && verdict.gateKind === SHELL_GATE_KIND
}

/** The smallest fused size whose blast frees the shell whole; null when none does. */
export function shellChargeSizeOf(session: BotSession, tile: TilePoint): number | null {
  const sizes = Array.from({ length: chargeSizeCount() }, (_, at) => at + 1)
  return sizes.find((size) => !isRemoteSize(size) && doesSizeFree(session, tile, size)) ?? null
}

function doesSizeFree(session: BotSession, tile: TilePoint, size: number): boolean {
  return gateOfTile(askerOf(session, blastOf(session, tile, size)), tile)?.verdict.outcome === 'cut'
}

function askerOf(session: BotSession, blast: BlastEvent | null): GateAsker {
  const state = session.state()
  return { state, playerId: session.playerId, params: paramsOfSession(state), blast }
}

function blastOf(session: BotSession, tile: TilePoint, size: number): BlastEvent {
  return {
    ...tile,
    radiusMm: chargeRadiusMm(size),
    size,
    playerId: session.playerId,
    source: 'charge',
    tick: session.tick(),
  }
}
