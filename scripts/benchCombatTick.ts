/**
 * Decision #9 follow-up 7 and #25 acceptance 12: six active enemies should cost under 0.5 ms at
 * the 95th percentile per authority tick on the reference machine. Measured and logged here, not
 * gated in CI, because CI machines vary. Run with `npm run bench:combat`; it prints one JSON line.
 *
 * Six burrowers circle a vehicle whose drill points at open sky, so none is ever pinned and
 * killed: they hunt, wind up, lunge and recoil for the whole run, which is the busiest case.
 */
import { createScriptedSession } from '../src/systems/authority/scriptedSession'
import {
  CORRIDOR_MIDDLE,
  poseAt,
  prepareCorridor,
  setHull,
  setUpgrade,
  spawnEnemy,
} from '../src/systems/authority/combat/combatFixtures'
import { hullMax } from '../src/systems/economy/vehicleStats'
import { toCanonical } from '../src/systems/money'
import { FACING } from '../src/systems/vehicle/vehiclePose'

const BUDGET_P95_MS = 0.5
/** A hull no burrower can wear down in the run, so the vehicle is never towed away. */
const HULL_LEVEL = 200
const MEASURED_TICKS = 3600
const REPORT_EVERY_TICKS = 12
const BURROWER_OFFSETS = [
  [5, 0],
  [-5, 0],
  [4, -3],
  [-4, -3],
  [2, -5],
  [-2, -5],
] as const

function percentile(times: readonly number[], fraction: number): number {
  const sorted = [...times].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))]
}

function benchSixEnemies(): void {
  const session = createScriptedSession()
  const start = prepareCorridor(session, FACING.up)
  session.submit(start, setUpgrade('hull', HULL_LEVEL))
  session.submit(start, setHull(toCanonical(hullMax(HULL_LEVEL))))
  for (const [dx, dy] of BURROWER_OFFSETS) session.submit(start, spawnEnemy('burrower', 3, dx, dy))
  const times: number[] = []
  for (let tick = start + 1; tick <= start + MEASURED_TICKS; tick++) {
    if (tick % REPORT_EVERY_TICKS === 0)
      session.submit(tick, poseAt(CORRIDOR_MIDDLE, { facing: FACING.up }))
    const begin = performance.now()
    session.advanceTo(tick)
    times.push(performance.now() - begin)
  }
  const p95Ms = percentile(times, 0.95)
  const hits = session.events().filter((event) => event.type === 'VehicleDamaged').length
  console.log(
    JSON.stringify({
      bench: 'combatTick',
      enemiesActive: session.state().combat.enemies.length,
      vehicleHits: hits,
      ticks: times.length,
      p50Ms: Number(percentile(times, 0.5).toFixed(3)),
      p95Ms: Number(p95Ms.toFixed(3)),
      budgetP95Ms: BUDGET_P95_MS,
      isWithinBudget: p95Ms < BUDGET_P95_MS,
    }),
  )
}

benchSixEnemies()
