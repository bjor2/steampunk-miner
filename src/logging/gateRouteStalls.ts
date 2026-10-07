/**
 * The bot's `gate_blocked_no_route` per seed, as `balance:charges` prints it (GD ruling on ticket
 * 237): the gated walls that stopped its way down with nothing it carries or buys to open them
 * (`systems/bot/gateRouteBlocks.ts`). Wanted 0 on every seed; extractor cells stay optional until
 * 148d (#296), so one is a placement bug, and each is listed with its planet, tile and need.
 */
import type { GateRouteBlock } from '../systems/bot/gateRouteBlocks'

export function gateRouteStallTableOf(
  blocksBySeed: readonly (readonly GateRouteBlock[])[],
  seeds: readonly number[],
): string {
  return [
    '| seed | gate_blocked_no_route | walls (planet: tile, need) |',
    '| --- | --- | --- |',
    ...seeds.map(
      (seed, at) => `| ${seed} | ${blocksBySeed[at].length} | ${wallsText(blocksBySeed[at])} |`,
    ),
  ].join('\n')
}

/** One line per seed whose bot met a wall it could not open on its way down. */
export function gateRouteStallWarnings(
  blocksBySeed: readonly (readonly GateRouteBlock[])[],
  seeds: readonly number[],
): string[] {
  return seeds.flatMap((seed, at) =>
    blocksBySeed[at].length === 0
      ? []
      : [
          `seed ${seed}: gate_blocked_no_route is ${blocksBySeed[at].length}, wanted 0 (${wallsText(blocksBySeed[at])})`,
        ],
  )
}

function wallsText(blocks: readonly GateRouteBlock[]): string {
  if (blocks.length === 0) return 'none'
  return blocks
    .map((block) => `P${block.planet}: (${block.tx}, ${block.ty}) ${block.required}`)
    .join('; ')
}
