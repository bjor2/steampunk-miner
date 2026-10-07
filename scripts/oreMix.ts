/**
 * Each planet's ore histogram per band against its mix (#141 acceptance 1, GD lock on #147): the
 * planet-mix slice generates every planet in the range on each pacing seed (#84), prints a line
 * per seed and band (type, role, observed share and the share the mix expects), and lists where
 * the seeds pooled miss the mix. Exits 1 when anything misses. A whole planet takes seconds to
 * generate, so the default 60 planets on three seeds take about half an hour:
 *
 *   npm run ore:mix -- --planets 1..60 [--seeds 83921,31415,27182]
 */
import { PACING_WORLD_SEEDS } from '../src/constants/pacingSeeds'
import { debugActionsBySlice } from '../src/debug/debugActionRegistry'
import { loadFeatures } from '../src/features'

loadFeatures()

interface HistogramAnswer {
  ok: boolean
  lines?: string[]
  mismatches?: string[]
  problems?: string[]
}

const DEFAULT_PLANETS = '1..60'

const histogramOf = debugActionsBySlice()['planet-mix']?.histogramOf
if (histogramOf === undefined) throw new Error('the planet-mix slice is not loaded')

const planets = planetRangeOf(argumentAfter('--planets') ?? DEFAULT_PLANETS)
const seeds = (argumentAfter('--seeds')?.split(',') ?? PACING_WORLD_SEEDS['bot-slice']).map(Number)
const mismatches = planets.flatMap((planet) => histogramLinesOf(planet))

console.log(
  mismatches.length === 0
    ? `ore:mix: planets ${planets[0]}-${planets.at(-1)} match their mix on seeds ${seeds.join(', ')}`
    : `ore:mix: ${mismatches.length} mismatches\n${mismatches.join('\n')}`,
)
process.exitCode = mismatches.length === 0 ? 0 : 1

function histogramLinesOf(planet: number): string[] {
  const answer = histogramOf(planet, seeds) as HistogramAnswer
  if (!answer.ok) throw new Error((answer.problems ?? []).join('\n'))
  console.log((answer.lines ?? []).join('\n'))
  return answer.mismatches ?? []
}

function argumentAfter(flag: string): string | undefined {
  const at = process.argv.indexOf(flag)
  return at === -1 ? undefined : process.argv[at + 1]
}

/** `3..12` or a single planet. */
function planetRangeOf(text: string): number[] {
  const [first, last = first] = text.split('..').map(Number)
  return Array.from({ length: last - first + 1 }, (_, at) => first + at)
}
