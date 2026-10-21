import { describe, expect, it } from 'vitest'
import { createScriptedSession } from '../authority/scriptedSession'
import { nextUpgradePrice } from '../authority/workshopRules'
import { trackIconIdOf } from '../art/icons/iconSet'
import { cmp } from '../money'
import { KEYBOARD_PROMPTS } from '../input/promptFixtures'
import { grantMoneyCommand } from '../startScenarioCommands'
import { setEnergyCommand, setHullCommand, setUpgradeCommand } from '../vehicle/vehicleCommands'
import { DESIGN_TOKENS } from './designSystem'
import { selectHudModel, type HudModel } from './hudModel'
import {
  depthStripTextOf,
  edgePermilleOf,
  hudStripOf,
  moneyChangeTextOf,
  type StripBar,
} from './hudStrip'
import { odometerCellsOf } from './odometer'
import { priceReading } from './viewParts'
import { ladderTierOf } from './warningLadder'

type Session = ReturnType<typeof createScriptedSession>

function hudOf(session: Session, depthTiles = 0): HudModel {
  return selectHudModel({
    state: session.state(),
    playerId: 'p1',
    depthTiles,
    prompts: KEYBOARD_PROMPTS,
  })
}

function sessionWithMoney(amount: string): Session {
  const session = createScriptedSession()
  session.submit(0, grantMoneyCommand(amount))
  return session
}

const barIds = (bars: readonly StripBar[]) => bars.map((bar) => bar.id)

/** The model with a heat gauge at this fill, as a heat planet's HUD would hold it. */
function withHeatAt(model: HudModel, permille: number): HudModel {
  const heat = { ...model.energy, permille, isThrottled: false, throttledText: '' }
  return { ...model, heat }
}

describe('HUD strip bars (ticket 684)', () => {
  it('draws hull, fuel and cargo as bars in that order, each with its glyph', () => {
    const model = hudOf(createScriptedSession())
    const { bars } = hudStripOf(model)
    expect(barIds(bars)).toEqual(['hull', 'fuel', 'cargo'])
    expect(bars.map((bar) => bar.iconId)).toEqual([
      model.hull.iconId,
      model.energy.iconId,
      model.cargo.iconId,
    ])
  })

  it('fills each bar with its gauge share and carries no number', () => {
    const session = createScriptedSession()
    session.submit(0, setHullCommand('0'))
    const [hull, fuel, cargo] = hudStripOf(hudOf(session)).bars
    expect(hull).toEqual({ id: 'hull', iconId: hull.iconId, fillPermille: 0, tier: 'empty' })
    expect(fuel.fillPermille).toBe(1000)
    expect(cargo.fillPermille).toBe(0)
    expect(Object.keys(fuel).sort()).toEqual(['fillPermille', 'iconId', 'id', 'tier'])
  })

  it('hatches the fuel bar by the ladder tier of the fuel left', () => {
    const session = createScriptedSession()
    const full = hudOf(session).energy
    session.submit(0, setEnergyCommand('20'))
    const fuel = hudStripOf(hudOf(session)).bars[1]
    expect(full.permille).toBe(1000)
    expect(fuel.tier).toBe(ladderTierOf(fuel.fillPermille))
    expect(fuel.tier).not.toBe('ok')
  })

  it('hatches the cargo bar by the room left, so a full hold is empty of room', () => {
    const model = hudOf(createScriptedSession())
    const fullHold = { ...model, cargo: { ...model.cargo, permille: 1000, isFull: true } }
    expect(hudStripOf(model).bars[2].tier).toBe('ok')
    expect(hudStripOf(fullHold).bars[2].tier).toBe('empty')
  })

  it('shows the heat bar only above 60% of its gauge', () => {
    const model = hudOf(createScriptedSession())
    const threshold = DESIGN_TOKENS.layout.strip.heatShowsAbovePercent * 10
    expect(barIds(hudStripOf(withHeatAt(model, threshold)).bars)).not.toContain('heat')
    const hot = hudStripOf(withHeatAt(model, threshold + 1)).bars
    expect(barIds(hot)).toEqual(['hull', 'fuel', 'cargo', 'heat'])
    expect(hot[3].fillPermille).toBe(threshold + 1)
    expect(hudStripOf(withHeatAt(model, 1000)).bars[3].tier).toBe('empty')
  })

  it('draws no heat bar off the heat planets', () => {
    expect(barIds(hudStripOf(hudOf(createScriptedSession())).bars)).not.toContain('heat')
  })
})

describe('HUD strip number (ticket 684)', () => {
  it('shows the money and the next-upgrade chip on the surface', () => {
    const model = hudOf(sessionWithMoney('1234'))
    const strip = hudStripOf(model)
    expect(strip.number).toEqual({ kind: 'money', text: '1,234', exact: model.money.exact })
    expect(strip.nextUpgrade).toEqual(model.nextUpgrade)
  })

  it('shows the depth as the only number underground, with no chip', () => {
    const strip = hudStripOf(hudOf(sessionWithMoney('1234'), 116))
    expect(strip.number).toEqual({ kind: 'depth', text: '116 m', exact: '116' })
    expect(strip.nextUpgrade).toBeNull()
  })

  it('fits money at 1e15 and its chip in six characters each', () => {
    const strip = hudStripOf(hudOf(sessionWithMoney('1e15')))
    expect(strip.number.text).toBe('1.00Qa')
    expect(strip.number.text.length).toBeLessThanOrEqual(DESIGN_TOKENS.numbers.maxChars)
    expect(strip.nextUpgrade?.price.text.length).toBeLessThanOrEqual(DESIGN_TOKENS.numbers.maxChars)
  })

  it('writes depth in metres below 10 km, then in km cut to one decimal', () => {
    expect(depthStripTextOf(0)).toBe('0 m')
    expect(depthStripTextOf(9999)).toBe('9,999 m')
    expect(depthStripTextOf(10000)).toBe('10.0 km')
    expect(depthStripTextOf(123456)).toBe('123.4 km')
  })
})

describe('HUD next-upgrade chip (ticket 684)', () => {
  it('offers the cheaper of drill power and drill tip, its icon and its price rounded up', () => {
    const session = createScriptedSession()
    session.submit(0, setUpgradeCommand('drill_power', 6))
    const state = session.state()
    const power = nextUpgradePrice(state, 'p1', 'drill_power')
    const tip = nextUpgradePrice(state, 'p1', 'drill_tip')
    const cheaper = cmp(tip, power) < 0 ? 'drill_tip' : 'drill_power'
    expect(hudOf(session).nextUpgrade).toEqual({
      upgradeId: cheaper,
      iconId: trackIconIdOf(cheaper),
      price: priceReading(cheaper === 'drill_tip' ? tip : power),
    })
  })

  it('keeps drill power on a tie', () => {
    const state = createScriptedSession().state()
    const power = nextUpgradePrice(state, 'p1', 'drill_power')
    const tip = nextUpgradePrice(state, 'p1', 'drill_tip')
    const chip = hudOf(createScriptedSession()).nextUpgrade
    expect(chip.upgradeId).toBe(cmp(tip, power) < 0 ? 'drill_tip' : 'drill_power')
  })
})

describe('HUD edge gauge (ticket 684)', () => {
  it('marks the rig from the surface at 0 to the core edge at 1000', () => {
    expect(edgePermilleOf(0, 400)).toBe(0)
    expect(edgePermilleOf(100, 300)).toBe(250)
    expect(edgePermilleOf(400, 0)).toBe(1000)
  })

  it('stays at the surface with no core distance to read', () => {
    expect(edgePermilleOf(0, null)).toBe(0)
  })
})

describe('warning ladder tiers (design section 7)', () => {
  it('stands a reading in the deepest tier it has reached', () => {
    expect(ladderTierOf(301)).toBe('ok')
    expect(ladderTierOf(300)).toBe('low')
    expect(ladderTierOf(151)).toBe('low')
    expect(ladderTierOf(150)).toBe('critical')
    expect(ladderTierOf(1)).toBe('critical')
    expect(ladderTierOf(0)).toBe('empty')
  })
})

describe('money float-up (ticket 684)', () => {
  it('says a gain rounded down and a spend rounded up', () => {
    expect(moneyChangeTextOf('100', '12445')).toBe('+12.3k')
    expect(moneyChangeTextOf('12445', '100')).toBe('-12.4k')
  })

  it('says nothing when the money did not change', () => {
    expect(moneyChangeTextOf('1e15', '1e15')).toBeNull()
  })
})

describe('money odometer cells (ticket 684)', () => {
  it('keys each cell by its place from the right and its character', () => {
    expect(odometerCellsOf('1.2k')).toEqual([
      { key: '3:1', char: '1', isDigit: true },
      { key: '2:.', char: '.', isDigit: false },
      { key: '1:2', char: '2', isDigit: true },
      { key: '0:k', char: 'k', isDigit: false },
    ])
  })

  it('keeps an unchanged ones place under the same key as the number grows', () => {
    const before = odometerCellsOf('99').at(-1)
    const after = odometerCellsOf('109').at(-1)
    expect(after?.key).toBe(before?.key)
  })
})
