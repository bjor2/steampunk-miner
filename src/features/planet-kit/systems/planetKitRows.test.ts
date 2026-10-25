import { describe, expect, it } from 'vitest'
import { toFixedText } from '../../../systems/money'
import { contentOf } from '../../../systems/registries/content'
import { hazardOfPlanet, ORE_ROWS } from '../../ores'
import economyFile from '../planet-kit.economy.json'
import kitsFile from '../planetKits.json'
import { PREMIUM_LIFT_CAP_BP } from './planetKitEconomy'
import { PLANET_KITS, planetKitGuardContext, planetKitProblems } from './planetKitRows'

type Raw = Record<string, unknown>
type MutableFile = { merchants: Raw[]; items: Raw[]; premiumTag: string }

const KIT_IDS = ['cache_crate', 'scree_plough', 'damp_flask', 'shard_tongs', 'vent_vane']
const PLANET_1 = { system: '1', planet: '1' }

/** A deep copy of the shipped rows for a spec to break one field of. */
function kitsCopy(): MutableFile {
  return structuredClone(kitsFile) as unknown as MutableFile
}

function economyCopy(): Raw {
  return structuredClone(economyFile) as unknown as Raw
}

function problemsOf(file: unknown, economy: unknown = economyFile): string[] {
  return planetKitProblems(file, economy, planetKitGuardContext())
}

describe('planet kits (ticket 820)', () => {
  it('ships five merchants, one on each of planets 1 to 5, under the names of the GD lock', () => {
    expect(PLANET_KITS.merchants.map((m) => [m.planet.system, m.planet.planet, m.name])).toEqual([
      ['1', '1', 'Hearthmoor Assay'],
      ['1', '2', 'Scree Yard'],
      ['1', '3', 'Gasworks'],
      ['1', '4', 'Lapidary'],
      ['1', '5', 'Boilerhouse'],
    ])
  })

  it("buys each planet's own pool and pays the premium on the locked uncommon ore of that pool", () => {
    expect(PLANET_KITS.merchants.map((m) => [m.buysPool, m.premiumOre.epithet])).toEqual([
      ['legacy', 'Honey Amber'],
      ['foothold-p2', 'Moonstone Lens'],
      ['foothold-p3', 'Green Apatite'],
      ['foothold-p4', 'Rose Quartz'],
      ['foothold-p5', 'Chromite'],
    ])
  })

  it('names the five items and their hover lines in Progression’s copy, verbatim', () => {
    expect(PLANET_KITS.items.map((item) => [item.id, item.name, item.hoverLine])).toEqual([
      ['cache_crate', 'Cache Crate', 'Drop your hold as a crate. Sold only on Hearthmoor.'],
      ['scree_plough', 'Scree Plough', 'Shoves fallen scree aside. The engine pulls weaker.'],
      ['damp_flask', 'Damp Flask', 'Hold still in firedamp to bottle it. Sold only on Coalfen.'],
      ['shard_tongs', 'Shard Tongs', 'Lifts spinecrystal whole as fragile cargo. Cuts slower.'],
      ['vent_vane', 'Vent Vane', "Ride a vent's blast up the shaft. Slower sideways."],
    ])
  })

  it('makes the crate and the flask consumables sold at home only with a carry limit of 3', () => {
    const consumables = PLANET_KITS.items.filter((item) => item.kind === 'consumable')
    expect(consumables.map((item) => [item.id, item.sale, item.stackLimit])).toEqual([
      ['cache_crate', 'home-only', 3],
      ['damp_flask', 'home-only', 3],
    ])
  })

  it('makes the plough, tongs and vane tools sold at home and later with no stack limit', () => {
    const tools = PLANET_KITS.items.filter((item) => item.kind === 'tool')
    expect(tools.map((item) => [item.id, item.sale, item.stackLimit])).toEqual([
      ['scree_plough', 'home-and-later', null],
      ['shard_tongs', 'home-and-later', null],
      ['vent_vane', 'home-and-later', null],
    ])
  })

  it('prices a tool at 1·R(g_home)·paceScale(g_home) and the consumables at 0.1 and 0.2 of R at the buyer', () => {
    const rules = PLANET_KITS.items.map((item) => [
      item.id,
      toFixedText(item.price.runValueShare, 1),
      item.price.paceScaled,
      item.price.pricedAt,
    ])
    expect(rules).toEqual([
      ['cache_crate', '0.1', false, 'buyer'],
      ['scree_plough', '1.0', true, 'home'],
      ['damp_flask', '0.2', false, 'buyer'],
      ['shard_tongs', '1.0', true, 'home'],
      ['vent_vane', '1.0', true, 'home'],
    ])
  })

  it('records the +25% premium at the cap and the 1.5 away markup as the fallback only', () => {
    expect(PLANET_KITS.premiumLiftBp).toBe(2500)
    expect(PREMIUM_LIFT_CAP_BP).toBe(2500)
    expect(toFixedText(PLANET_KITS.awayMarkup, 1)).toBe('1.5')
  })

  it("hooks each item on its home planet's #651 hazard, and the crate on none", () => {
    for (const item of PLANET_KITS.items) {
      const hazard = hazardOfPlanet(ORE_ROWS.planets, Number(item.homePlanet.planet))
      expect([item.id, item.effect.hazard]).toEqual([item.id, hazard?.kind ?? null])
    }
  })

  it('lists every merchant’s stock in debut order: tools carry forward, consumables stay home', () => {
    expect(PLANET_KITS.merchants.map((m) => m.stock)).toEqual([
      ['cache_crate'],
      ['scree_plough'],
      ['scree_plough', 'damp_flask'],
      ['scree_plough', 'shard_tongs'],
      ['scree_plough', 'shard_tongs', 'vent_vane'],
    ])
  })

  it('holds nothing from sale since each hazard tool has its verb (the GD’s ship rule, ticket 882)', () => {
    expect([...PLANET_KITS.heldFromSale]).toEqual([])
  })

  it('registers nothing: no planet-kit id reaches the content registries before PK4', () => {
    const kinds = ['vehicle-item', 'power-up', 'tech-node'] as const
    const ids = kinds.flatMap((kind) => contentOf(kind).map((entry) => entry.id))
    expect(ids.filter((id) => id.startsWith('planet-kit.'))).toEqual([])
    expect(ids.filter((id) => KIT_IDS.some((kit) => id.endsWith(kit)))).toEqual([])
  })

  it('accepts the shipped rows against the ores, materials and solar-systems facts', () => {
    expect(problemsOf(kitsFile)).toEqual([])
  })
})

describe('planet kit guards (ticket 820)', () => {
  it('refuses a tool sold at home only and a consumable sold later', () => {
    const file = kitsCopy()
    file.items[1]!.sale = 'home-only'
    file.items[2]!.sale = 'home-and-later'
    expect(problemsOf(file)).toEqual(
      expect.arrayContaining([
        'scree_plough: a tool is sold home-and-later, not home-only',
        'damp_flask: a consumable is sold home-only, not home-and-later',
      ]),
    )
  })

  it("refuses a consumable whose stack limit is not the economy's carry limit", () => {
    const file = kitsCopy()
    file.items[0]!.stackLimit = 4
    expect(problemsOf(file)).toEqual(['cache_crate: stack limit 4 is not the carry limit 3'])
  })

  it('refuses a stack limit on a tool and a consumable without one', () => {
    const file = kitsCopy()
    file.items[1]!.stackLimit = 3
    delete file.items[2]!.stackLimit
    expect(problemsOf(file)).toEqual([
      'items[1].stackLimit is for consumables only',
      'items[2].stackLimit is required on a consumable',
    ])
  })

  it("refuses a premium ore from another planet's pool, a common one, or one not in band 1", () => {
    const file = kitsCopy()
    file.merchants[0]!.premiumOre = 'p2-u3'
    const problems = problemsOf(file)
    expect(problems).toContain(
      'Hearthmoor Assay: premium ore p2-u3 is of pool foothold-p2, not legacy',
    )
    expect(problems).toContain('premium ore p2-u3 appears more than once')
  })

  it('refuses a merchant buying a pool that is not its own planet’s', () => {
    const file = kitsCopy()
    file.merchants[1]!.buys = { pool: 'legacy' }
    expect(problemsOf(file)).toEqual([
      "Scree Yard buys pool legacy; its planet's pool is foothold-p2",
      'Scree Yard: premium ore p2-u3 is of pool foothold-p2, not legacy',
    ])
  })

  it('refuses a stock list the sale rule does not give', () => {
    const file = kitsCopy()
    file.merchants[2]!.stock = ['damp_flask']
    expect(problemsOf(file)).toEqual([
      'Gasworks stocks [damp_flask]; the sale rule gives [scree_plough, damp_flask]',
    ])
  })

  it('refuses an item hooked on a hazard its home planet does not have', () => {
    const file = kitsCopy()
    file.items[1]!.effect = {
      ...(file.items[1]!.effect as Raw),
      hazard: 'firedamp',
      hazardEffect: 'drain',
    }
    expect(problemsOf(file)).toEqual([
      'scree_plough: hooks hazard firedamp; its home planet has rockfall',
      "scree_plough: names hazard effect drain; the hazard's is refill",
      'rockfall: scree_plough hooks firedamp, not this family',
      'scree_plough: not on the kit row of its hazard firedamp',
    ])
  })

  it('refuses a behaviour the first system or the SS2-B families already own', () => {
    const file = kitsCopy()
    file.items[4]!.effect = { ...(file.items[4]!.effect as Raw), behaviour: 'disable_tools' }
    file.items[3]!.effect = { ...(file.items[3]!.effect as Raw), behaviour: 'clog_drill' }
    expect(problemsOf(file)).toEqual([
      'shard_tongs: behaviour clog_drill repeats earlier content',
      'vent_vane: behaviour disable_tools repeats earlier content',
    ])
  })

  it('refuses a merchant gap and a second kit item on one planet', () => {
    const file = kitsCopy()
    file.merchants.splice(2, 1)
    expect(problemsOf(file)).toEqual(
      expect.arrayContaining([
        'merchants[2] is planet (1,4); expected (1,3)',
        'merchants[3] is planet (1,5); expected (1,4)',
        'damp_flask: no merchant on its home planet (1,3)',
      ]),
    )
  })

  it('refuses copy over the #680 budget: a four-word name or a thirteen-word hover line', () => {
    const file = kitsCopy()
    file.items[0]!.name = 'The Big Cache Crate'
    file.items[1]!.hoverLine =
      'One two three four five six seven eight nine ten eleven twelve thirteen.'
    expect(problemsOf(file)).toEqual([
      'items[0].name "The Big Cache Crate" is 4 words, over 3',
      'items[1].hoverLine "One two three four five six seven eight nine ten eleven twelve thirteen." is 13 words, over 12',
    ])
  })

  it('refuses a field no row has, and a premium tag without the ore slot', () => {
    const file = kitsCopy()
    file.items[0]!.priceMoney = '12'
    file.merchants[0]!.markup = 2
    file.premiumTag = 'Pays extra.'
    expect(problemsOf(file)).toEqual([
      'premiumTag must hold <ore>',
      'merchants[0].markup is not a field of this row',
      'items[0].priceMoney is not a field of this row',
    ])
  })

  it('refuses a premium over +25% and a consumable price share that names no item', () => {
    const economy = economyCopy()
    ;(economy.premium as Raw).liftBp = 2600
    expect(problemsOf(kitsFile, economy)).toEqual([
      'premium.liftBp must be a whole number in 1..2500',
    ])
    const stray = economyCopy()
    ;((stray.consumables as Raw).runValueShare as Raw).vent_vane = '0.3'
    expect(problemsOf(kitsFile, stray)).toEqual([
      'consumables.runValueShare.vent_vane names no consumable kit item',
    ])
  })

  it('refuses an item held from sale that names no kit item, or one listed twice', () => {
    const stray = economyCopy()
    stray.heldFromSale = ['scree_hood', 'vent_vane', 'vent_vane']
    expect(problemsOf(kitsFile, stray)).toEqual(['heldFromSale[2] lists vent_vane again'])
    const unknown = economyCopy()
    unknown.heldFromSale = ['scree_hood']
    expect(problemsOf(kitsFile, unknown)).toEqual(['heldFromSale.scree_hood names no kit item'])
  })

  it('lists every problem at once rather than stopping at the first', () => {
    const file = kitsCopy()
    file.items[0]!.stackLimit = 9
    file.items[2]!.stackLimit = 9
    expect(problemsOf(file)).toHaveLength(2)
  })

  it('keys a kit on (s,p): a merchant row of system 2 is refused in the first-system table', () => {
    const file = kitsCopy()
    file.merchants[0]!.planet = { system: '2', planet: '1' }
    expect(problemsOf(file)).toContain('merchants[0] is planet (2,1); expected (1,1)')
    expect(PLANET_KITS.merchants[0]!.planet).toEqual(PLANET_1)
  })
})
