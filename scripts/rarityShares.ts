/**
 * Writes ticket 449's share table, the materials' share bounds on every judged planet and pacing
 * seed with the #385 income cap beside them, to docs/economy/rarity-shares.json, the file the
 * status page prints (scripts/status/rarityShareHtml.mjs). The roster slice's debug action builds
 * it. Rerun it when the ore rows, the kinds, the planet mix or an income rate changes:
 * `src/features/roster/rarityShares.test.ts` fails while the committed file is stale. Prints each
 * planet's line and every bound missed, and exits 1 on a miss. About ten seconds:
 *
 *   npm run rarity:shares
 */
import { writeFileSync } from 'node:fs'
import { debugActionsBySlice } from '../src/debug/debugActionRegistry'
import { loadFeatures } from '../src/features'

loadFeatures()

/** Where the page reads the table from (the roster slice's `RARITY_SHARES_DOC`). */
const RARITY_SHARES_DOC = 'docs/economy/rarity-shares.json'

interface ShareTableAnswer {
  ok: boolean
  table?: {
    planets: {
      planet: number
      hold: number
      hasRoster: boolean
      worstCommonKindOfPlanetBp: number | null
      violations: string[]
    }[]
  }
}

const shareTableAction = debugActionsBySlice().roster?.shareTable
if (shareTableAction === undefined) throw new Error('the roster slice is not loaded')
const { table } = shareTableAction() as ShareTableAnswer
if (table === undefined) throw new Error('the roster slice read no share table')

writeFileSync(RARITY_SHARES_DOC, `${JSON.stringify(table, null, 2)}\n`)
for (const planet of table.planets) {
  const kinds = planet.hasRoster
    ? `worst common kind ${planet.worstCommonKindOfPlanetBp} bp of the planet`
    : 'no roster'
  console.log(`P${planet.planet} hold ${planet.hold}: ${kinds}, ${planet.violations.length} missed`)
}
const missed = table.planets.flatMap((planet) => planet.violations)
console.log(missed.length === 0 ? 'rarity:shares: every bound holds' : missed.join('\n'))
console.log(`rarity:shares: wrote ${RARITY_SHARES_DOC}`)
process.exitCode = missed.length === 0 ? 0 : 1
