/**
 * The GD ruling on ticket 237, `gate_blocked_no_route`: a gated wall on the bot's way down (the
 * path from the pad, the shaft or a jog of it) that nothing the bot carries or buys opens, where
 * the shaft found no clear column to step round it (`botShaft.ts`). The extractors' cells stay
 * optional until 148d (#296), so the count must be 0 on every seed. A gallery face a gate stops is
 * no stall: that side of the gallery ends and the bot mines on. Each wall is noted once per planet.
 */
import type { TilePoint } from '../world/tileGrid'
import { openTile, type OpenOutcome } from './botDig'
import { drillGateAt, isWallNoMeansOpen } from './botGates'
import type { BotPlanet } from './botPilot'
import type { BotSession } from './botSession'

export interface GateRouteBlock {
  planet: number
  tx: number
  ty: number
  gateKind: string
  required: string
}

/** Opens a tile on the bot's way down, and notes the gate when it is a wall no means opens. */
export function openRouteTile(
  session: BotSession,
  planet: BotPlanet,
  tile: TilePoint,
): OpenOutcome {
  const opened = openTile(session, planet, tile)
  if (opened === 'blocked') noteGateRouteBlock(session, planet, tile)
  return opened
}

function noteGateRouteBlock(session: BotSession, planet: BotPlanet, tile: TilePoint): void {
  const verdict = drillGateAt(session, tile)
  if (verdict === null || !isWallNoMeansOpen(verdict)) return
  const block = {
    planet: session.state().planet.index,
    ...tile,
    gateKind: verdict.gateKind,
    required: verdict.required,
  }
  if (!planet.gateRouteBlocks.some((noted) => isSameWall(noted, block))) {
    planet.gateRouteBlocks.push(block)
  }
}

function isSameWall(noted: GateRouteBlock, block: GateRouteBlock): boolean {
  return noted.planet === block.planet && noted.tx === block.tx && noted.ty === block.ty
}
