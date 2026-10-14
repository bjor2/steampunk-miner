/**
 * What collapse reads of ground reinforcement (ticket 365, the TD lock on #157 section 1): a
 * reinforced cell never refills, and a block whose open cells are all reinforced is not weak and
 * never warns. Reinforcement is checked before braces (#331), so a reinforced block never even
 * warns and has nothing to brace.
 *
 * A block's open cells are the tiles holding its carved air, the air a refill would fill. A block
 * with none is never reinforced, so a forced collapse of solid ground stays what it was. With no
 * provider registered nothing here reads the ground.
 */
import { samplesOfBlock, type CollapseBlock } from '../../world/collapseBlock'
import type { CellReinforced } from '../../world/collapseRefill'
import type { PlanetParams } from '../../world/planetParams'
import { SAMPLES_PER_TILE } from '../../world/sampleGrid'
import { isCarvedAirAt, openSampleLayers } from '../../world/sampleLayers'
import type { TilePoint } from '../../world/tileGrid'
import { hasReinforcementProviders, isCellReinforced } from '../../registries/groundReinforcement'
import type { AuthorityState } from '../authorityState'

/** The block has open cells and every one of them is reinforced. */
export function isBlockReinforced(
  state: AuthorityState,
  params: PlanetParams,
  block: CollapseBlock,
): boolean {
  if (!hasReinforcementProviders()) return false
  const open = openTilesOfBlock(state, params, block)
  return open.length > 0 && open.every(({ tx, ty }) => isCellReinforced(state, tx, ty))
}

/** The refill's view of reinforcement: asked once per tile for one refill call. */
export function reinforcedCellsOf(state: AuthorityState): CellReinforced {
  if (!hasReinforcementProviders()) return () => false
  const answers = new Map<string, boolean>()
  return (tx, ty) => {
    const key = `${tx},${ty}`
    const known = answers.get(key)
    if (known !== undefined) return known
    const answer = isCellReinforced(state, tx, ty)
    answers.set(key, answer)
    return answer
  }
}

/** The tiles holding the block's carved air, once each, in row order of their first sample. */
function openTilesOfBlock(
  state: AuthorityState,
  params: PlanetParams,
  block: CollapseBlock,
): TilePoint[] {
  const layers = openSampleLayers(state.world, params)
  const tiles = new Map<string, TilePoint>()
  for (const { sx, sy } of samplesOfBlock(block)) {
    if (!isCarvedAirAt(layers, sx, sy)) continue
    const tile = { tx: tileOf(sx), ty: tileOf(sy) }
    tiles.set(`${tile.tx},${tile.ty}`, tile)
  }
  return [...tiles.values()]
}

function tileOf(sample: number): number {
  return Math.floor(sample / SAMPLES_PER_TILE)
}
