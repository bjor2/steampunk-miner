/** Profiling helper for #154 (not a reported measurement): the detonation tick alone, R from BLAST_R. */
import { ECONOMY } from '../src/systems/economy/economy'
import { fromCanonical } from '../src/systems/money'
;(ECONOMY.blastingCharges as { blastRadiusTiles: unknown }).blastRadiusTiles = fromCanonical(
  process.env.BLAST_R ?? '32',
)
const { advanceTicks } = await import('../src/systems/authority/advanceTicks')
const { createScriptedSession } = await import('../src/systems/authority/scriptedSession')
const fixtures = await import('../src/systems/authority/charges/chargeFixtures')
const { chargeFuseTicks } = await import('../src/systems/economy/blastingCharges')
for (let i = 0; i < 8; i++) {
  const s = createScriptedSession()
  fixtures.prepareBlaster(s, 0)
  fixtures.plantOnWall(s, 1)
  s.advanceTo(chargeFuseTicks())
  const t = performance.now()
  advanceTicks(s.state(), 1 + chargeFuseTicks())
  console.log('tick ms', (performance.now() - t).toFixed(1))
}
