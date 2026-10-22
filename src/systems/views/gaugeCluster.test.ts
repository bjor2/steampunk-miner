import { describe, expect, it } from 'vitest'
import { SHIPPED_ART } from '../../scene/shippedArt'
import { createScriptedSession } from '../authority/scriptedSession'
import { KEYBOARD_PROMPTS } from '../input/promptFixtures'
import { setEnergyCommand, setHullCommand } from '../vehicle/vehicleCommands'
import { DESIGN_TOKENS } from './designSystem'
import {
  chainBadgeTextOf,
  dialNumberCharsMaxOf,
  dialTurnDegreesOf,
  dialZoneOf,
  gaugeClusterOf,
  type DialFace,
} from './gaugeCluster'
import {
  GAUGE_CLUSTER,
  gaugeClusterProblemsOf,
  gaugeSkinArtProblemsOf,
  type GaugeClusterTable,
} from './gaugeClusterTable'
import { selectHudModel, type HudModel } from './hudModel'

// Ticket 716 (G&V 1, spec #678): the strip's hull, fuel, cargo chain, heat and depth as brass
// dials from a data list with an overflow count, the tool slots' pattern. Needles only; the number
// is revealed on hover or tap, through the #681 formatter the readings already carry. Amber at 25%
// and red at 10% of what a reading has left, on the render that brings the value.

type Session = ReturnType<typeof createScriptedSession>

function hudOf(session: Session, depthTiles = 0): HudModel {
  return selectHudModel({
    state: session.state(),
    playerId: 'p1',
    depthTiles,
    prompts: KEYBOARD_PROMPTS,
  })
}

/** The model with a heat gauge at this fill, as a heat planet's HUD would hold it. */
function withHeatAt(model: HudModel, permille: number): HudModel {
  return { ...model, heat: { ...model.energy, permille, isThrottled: false, throttledText: '' } }
}

const idsOf = (dials: readonly DialFace[]) => dials.map((dial) => dial.id)
const dialOf = (dials: readonly DialFace[], id: string) => dials.find((dial) => dial.id === id)
const RUN_DEPTH = 40

describe('gauge cluster table (ticket 716)', () => {
  it('holds a drawable table: known readings, skins, room, ordered zones and named art', () => {
    expect(gaugeClusterProblemsOf(GAUGE_CLUSTER)).toEqual([])
  })

  it('draws only UI sprites the export shipped as final, so a missing asset fails the load', () => {
    expect(gaugeSkinArtProblemsOf(GAUGE_CLUSTER, SHIPPED_ART)).toEqual([])
    const missing: GaugeClusterTable = {
      ...GAUGE_CLUSTER,
      skins: { brass: { dial: 'ui-gauge-dial', needle: 'ui-gauge-pointer' } },
    }
    expect(gaugeSkinArtProblemsOf(missing, SHIPPED_ART)).toEqual([
      '"ui-gauge-pointer" is not a shipped UI sprite',
    ])
  })

  it('refuses a row that reads nothing known, a missing skin and zones out of order', () => {
    const broken = {
      ...GAUGE_CLUSTER,
      dials: [{ id: 'wagon', reads: 'wagon', skin: 'copper' }],
      zones: { amberAtPercent: 10, redAtPercent: 25 },
    } as unknown as GaugeClusterTable
    expect(gaugeClusterProblemsOf(broken)).toEqual([
      'dial "wagon" reads "wagon"',
      'dial "wagon" names no skin "copper"',
      'zones must hold 0 <= red 25 < amber 10',
    ])
  })
})

describe('gauge cluster dials (ticket 716)', () => {
  it('draws hull, fuel, cargo and depth in a run off a heat planet, in the table order', () => {
    const view = gaugeClusterOf(hudOf(createScriptedSession(), RUN_DEPTH), 'phone')
    expect(idsOf(view.dials)).toEqual(['hull', 'fuel', 'cargo', 'depth'])
    expect(view.overflowCount).toBe(0)
  })

  it('folds the dials past a phone surface strip into the overflow count', () => {
    const model = withHeatAt(hudOf(createScriptedSession()), 900)
    const phone = gaugeClusterOf(model, 'phone')
    expect(idsOf(phone.dials)).toEqual(['hull', 'fuel', 'cargo'])
    expect(phone.overflowCount).toBe(2)
    expect(phone.overflowText).toBe('+2')
    expect(gaugeClusterOf(model, 'desktop').overflowCount).toBe(0)
  })

  it('sets each needle on its reading and carries no number in view, only the revealed text', () => {
    const session = createScriptedSession()
    session.submit(0, setHullCommand('0'))
    const model = hudOf(session, RUN_DEPTH)
    const hull = dialOf(gaugeClusterOf(model, 'desktop').dials, 'hull')
    expect(hull).toMatchObject({ needlePermille: 0, leftPermille: 0, text: model.hull.text })
    expect(hull?.exact).toBe(model.hull.exact)
  })

  it('reads the cargo chain by the room left, so a full hold is red', () => {
    const model = hudOf(createScriptedSession(), RUN_DEPTH)
    const full = { ...model, cargo: { ...model.cargo, permille: 1000, isFull: true } }
    expect(dialOf(gaugeClusterOf(full, 'phone').dials, 'cargo')).toMatchObject({
      needlePermille: 1000,
      leftPermille: 0,
      zone: 'red',
    })
  })

  it('keeps the heat slot on a heat planet and draws its dial only above 60%', () => {
    const threshold = DESIGN_TOKENS.layout.strip.heatShowsAbovePercent * 10
    const model = hudOf(createScriptedSession(), RUN_DEPTH)
    const cool = dialOf(gaugeClusterOf(withHeatAt(model, threshold), 'phone').dials, 'heat')
    const hot = dialOf(gaugeClusterOf(withHeatAt(model, threshold + 1), 'phone').dials, 'heat')
    expect(cool?.isHeld).toBe(true)
    expect(hot?.isHeld).toBe(false)
    expect(dialOf(gaugeClusterOf(model, 'phone').dials, 'heat')).toBeUndefined()
  })

  it('reads the depth over the planet radius with its band and core marks', () => {
    const model = hudOf(createScriptedSession(), RUN_DEPTH)
    const depth = dialOf(gaugeClusterOf(model, 'phone').dials, 'depth')
    const radius = model.depth.scale?.radiusTiles ?? 0
    expect(depth?.needlePermille).toBe(Math.floor((RUN_DEPTH * 1000) / radius))
    expect(depth?.markers.map((marker) => marker.kind)).toEqual([
      'band',
      'band',
      'band',
      'band',
      'core',
    ])
    expect(depth?.text).toBe(`${RUN_DEPTH} m`)
  })

  it('shows the chain badge only once a wagon links on, through the shared formatter', () => {
    expect(chainBadgeTextOf(1)).toBeNull()
    expect(chainBadgeTextOf(3)).toBe('3')
    expect(chainBadgeTextOf(12_345)).toBe('12.3k')
    const model = hudOf(createScriptedSession(), RUN_DEPTH)
    expect(dialOf(gaugeClusterOf(model, 'phone').dials, 'cargo')?.badge).toBeNull()
  })

  it('draws every dial through its skin art and the cluster in the glass frame', () => {
    const view = gaugeClusterOf(hudOf(createScriptedSession(), RUN_DEPTH), 'desktop')
    expect(view.frameArt).toBe('--art-glass-frame')
    expect(view.dials.every((dial) => dial.art.face === '--art-gauge-dial')).toBe(true)
    expect(view.dials.every((dial) => dial.art.needle === '--art-gauge-needle')).toBe(true)
  })

  it('turns a needle over the 240 degrees of the baked ticks, empty on the left', () => {
    expect([0, 500, 1000].map(dialTurnDegreesOf)).toEqual([-120, 0, 120])
  })

  it('keeps room for the widest number a dial reveals', () => {
    expect(dialNumberCharsMaxOf()).toBe(2 * DESIGN_TOKENS.numbers.maxChars + 3)
  })
})

describe('gauge cluster zones (ticket 716)', () => {
  it('turns amber at 25% and red at 10% of what is left', () => {
    expect(GAUGE_CLUSTER.zones).toEqual({ amberAtPercent: 25, redAtPercent: 10 })
    expect([251, 250, 101, 100, 0].map((left) => dialZoneOf(left))).toEqual([
      'ok',
      'amber',
      'amber',
      'red',
      'red',
    ])
  })

  it('shows a fuel change in the zone and needle of the same view', () => {
    const session = createScriptedSession()
    const fullFuel = dialOf(gaugeClusterOf(hudOf(session, RUN_DEPTH), 'phone').dials, 'fuel')
    const fullTank = Number(hudOf(session).energy.exact)
    session.submit(0, setEnergyCommand(String(fullTank / 5)))
    const low = dialOf(gaugeClusterOf(hudOf(session, RUN_DEPTH), 'phone').dials, 'fuel')
    expect(fullFuel?.zone).toBe('ok')
    expect(low?.needlePermille).toBe(200)
    expect(low?.zone).toBe('amber')
  })

  it('never zones the depth dial, which has nothing to run out of', () => {
    const model = hudOf(createScriptedSession(), RUN_DEPTH)
    expect(dialOf(gaugeClusterOf(model, 'phone').dials, 'depth')?.zone).toBe('ok')
  })
})
