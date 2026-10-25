import { describe, expect, it } from 'vitest'
import economyFile from '../planet-kit.economy.json'
import kitsFile from '../planetKits.json'
import { PLANET_KIT_ECONOMY, planetKitGuardContext, planetKitProblems } from './planetKitRows'
import { KIT_TOOL_TRADE_OFFS } from './kitToolRules'

// The hazard tools' numbers while they act (ticket 881; #850's rows under the GD lock): one row
// per hazard tool, a factor on its hazard and a trade-off on the track its row names, the 30-tick
// tail and the flask's 60 s window, refused whole when a row is missing, extra or out of range;
// each tool's one outcome and the flask's clear radius (ticket 882).

type Raw = Record<string, unknown>

function actingCopy(): { economy: Raw; acting: Raw; tools: Record<string, Raw> } {
  const economy = structuredClone(economyFile) as unknown as Raw
  const acting = economy.acting as Raw
  return { economy, acting, tools: acting.tools as Record<string, Raw> }
}

function problemsOf(economy: unknown): string[] {
  return planetKitProblems(kitsFile, economy, planetKitGuardContext())
}

describe('kit tools acting numbers', () => {
  it('ships #850’s rows: refill −50%, bite and shove −60%, a 30-tick tail and a 60 s flask', () => {
    const { acting } = PLANET_KIT_ECONOMY
    expect(acting.tools.map((row) => [row.itemId, row.factorBp])).toEqual([
      ['scree_plough', 5000],
      ['shard_tongs', 4000],
      ['vent_vane', 4000],
    ])
    expect(acting.tailTicks).toBe(30)
    expect(acting.flask).toEqual({
      itemId: 'damp_flask',
      factorBp: 0,
      openTicks: 3600,
      clearRadiusTiles: 2,
    })
  })

  it('gives each tool one outcome: the plough shoves 1 tile aside, the tongs loot, the vane aims out', () => {
    expect(PLANET_KIT_ECONOMY.acting.tools.map((row) => [row.itemId, row.outcome])).toEqual([
      ['scree_plough', { verb: 'shove_aside', sideTiles: 1 }],
      ['shard_tongs', { verb: 'loot' }],
      ['vent_vane', { verb: 'aim_outward' }],
    ])
  })

  it('refuses a tool with no verb, an unknown verb, a shove of no tiles and a field no verb has', () => {
    const { economy, acting, tools } = actingCopy()
    delete tools.scree_plough.outcome
    tools.shard_tongs.outcome = { verb: 'shatter' }
    tools.vent_vane.outcome = { verb: 'aim_outward', liftBp: 1500 }
    ;(acting.flask as Raw).clearRadiusTiles = -1
    expect(problemsOf(economy)).toEqual([
      'acting.tools.scree_plough.outcome must name its verb: shove_aside, loot, aim_outward',
      'acting.tools.shard_tongs.outcome must name its verb: shove_aside, loot, aim_outward',
      "acting.tools.vent_vane.outcome.liftBp is not a field of the kits' economy",
      'acting.flask.clearRadiusTiles must be whole tiles from 0',
    ])
    tools.scree_plough.outcome = { verb: 'shove_aside', sideTiles: 0 }
    tools.shard_tongs.outcome = { verb: 'loot' }
    tools.vent_vane.outcome = { verb: 'aim_outward' }
    ;(acting.flask as Raw).clearRadiusTiles = 2
    expect(problemsOf(economy)).toEqual([
      'acting.tools.scree_plough.outcome.sideTiles must be whole tiles from 1',
    ])
  })

  it('pays thrust −10%, cut speed −25% and horizontal speed −30%, each over its floor', () => {
    expect(KIT_TOOL_TRADE_OFFS).toEqual([
      { id: 'planet-kit.scree_plough', axis: 'thrust', penaltyBp: -1000, floorBp: 9000 },
      { id: 'planet-kit.shard_tongs', axis: 'dig', penaltyBp: -2500, floorBp: 7500 },
      { id: 'planet-kit.vent_vane', axis: 'horizontal', penaltyBp: -3000, floorBp: 7000 },
    ])
  })

  it('refuses a hazard tool with no row and a row that names no hazard tool', () => {
    const { economy, tools } = actingCopy()
    tools.cache_crate = tools.vent_vane
    delete tools.vent_vane
    expect(problemsOf(economy)).toEqual([
      'acting.tools has no row for the hazard tool vent_vane',
      'acting.tools.cache_crate names no hazard tool',
    ])
  })

  it('refuses a factor past the whole, a boost, a field no row has and a flask that is no consumable', () => {
    const { economy, acting, tools } = actingCopy()
    const outcome = tools.scree_plough.outcome
    tools.scree_plough = { factorBp: 10001, penaltyBp: 500, floorBp: 9000, outcome, extra: 1 }
    acting.flask = { itemId: 'scree_plough', factorBp: 0, openTicks: 3600, clearRadiusTiles: 2 }
    expect(problemsOf(economy)).toEqual([
      'acting.tools.scree_plough.factorBp must be whole bp, 0 to 10000',
      'acting.tools.scree_plough.penaltyBp must be a whole number of bp, 0 or below',
      "acting.tools.scree_plough.extra is not a field of the kits' economy",
    ])
    tools.scree_plough = { factorBp: 5000, penaltyBp: -1000, floorBp: 9000, outcome }
    expect(problemsOf(economy)).toEqual([
      'acting.flask.scree_plough names no consumable kit item with a hazard',
    ])
  })

  it('refuses a broken tail and a flask that never stays open', () => {
    const { economy, acting } = actingCopy()
    acting.tailTicks = -1
    ;(acting.flask as Raw).openTicks = 0
    expect(problemsOf(economy)).toEqual([
      'acting.tailTicks must be whole ticks from 0',
      'acting.flask.openTicks must be whole from 1',
    ])
  })
})
