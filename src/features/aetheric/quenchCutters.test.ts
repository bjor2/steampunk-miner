import { describe, expect, it } from 'vitest'
import { TICKS_PER_SECOND } from '../../constants/physics'
import { CONDENSE_RATIO } from '../../systems/aetheric/condense'
import type { DomainEvent } from '../../systems/authority/domainEvent'
import { setVehicleLoadoutCommand } from '../../systems/authority/loadoutCommands'
import {
  createScriptedSession,
  poseAbove,
  surfaceOreTiles,
  type ScriptedSession,
} from '../../systems/authority/scriptedSession'
import { ENERGY_QUANTA_PER_TICK } from '../../systems/vehicle/energyQuanta'
import { FACING } from '../../systems/vehicle/vehiclePose'
import type { TilePoint } from '../../systems/world/tileGrid'
import { intentToUseSlot } from '../power-up-core'
import { AETHERIC_ECONOMY } from './systems/aethericEconomy'
import { QUENCH_CUTTERS_ID } from './systems/aethericCombos'
import { CONDENSER_ID } from './systems/condenserItem'
import { itemHeatUnitsAt } from './systems/itemHeat'
import { cutterHeatOfDigTicks, digTicksOf } from './systems/quenchCutters'

// Quench cutters (ticket 373, aetheric × drill-gear, as the GD ruled it on 14 Oct): with the side
// cutters engaged, the drill's dig time puts the cutters' heat on the off-act item gauge, counted
// per second dug and never per cell, and a condenser run with them engaged drinks it at the
// condenser's own ratio. On planet 1's surface, beside ore, so the cutters widen the bore.

const CUTTERS = 'gear.side_cutters'
const SLOTS = { 'drill.flank': CUTTERS, 'powerup.1': CONDENSER_ID }
const DRILL_TICKS = 60
const QUENCH = AETHERIC_ECONOMY.combo.quenchCutters

/** A surface ore cell's neighbour as the downward drill target: the cutters reach the ore. */
function targetBesideOre(): TilePoint {
  const [ore] = surfaceOreTiles(1)
  return { tx: ore.tx - 1, ty: ore.ty - 1 }
}

type DrillDamageDealt = Extract<DomainEvent, { type: 'DrillDamageDealt' }>

interface CutterDig {
  session: ScriptedSession
  dug: DrillDamageDealt[]
  drillTick: number
}

const isDrillDamage = (event: DomainEvent): event is DrillDamageDealt =>
  event.type === 'DrillDamageDealt'

function cutterDig({ owned = [QUENCH_CUTTERS_ID], engage = true } = {}): CutterDig {
  const target = targetBesideOre()
  const session = createScriptedSession()
  session.submit(0, setVehicleLoadoutCommand(SLOTS, owned))
  session.submit(1, poseAbove(target, FACING.down))
  if (engage) session.submit(2, intentToUseSlot('drill.flank'))
  const drillTick = 10 + DRILL_TICKS
  const events = session.submit(
    drillTick,
    poseAbove(target, FACING.down, { drillTicks: DRILL_TICKS }),
  )
  return { session, dug: events.filter(isDrillDamage), drillTick }
}

const heatOf = ({ session, drillTick }: CutterDig) =>
  itemHeatUnitsAt(session.state(), 'p1', drillTick)

const ofType = (session: ScriptedSession, type: string): DomainEvent[] =>
  session.events().filter((event) => event.type === type)

describe('quench cutters', () => {
  it("puts the cutters' heat on the item gauge for the seconds the drill dug", () => {
    const dig = cutterDig()
    const digTicks = digTicksOf(dig.dug)
    expect(digTicks).toBeGreaterThan(0)
    expect(heatOf(dig)).toBe(cutterHeatOfDigTicks(digTicks))
    expect(heatOf(dig)).toBeGreaterThan(0)
  })

  it('counts dig time, never cells: the cutters widen the cut but add no heat for it', () => {
    const dig = cutterDig()
    const cut = dig.session.events().filter((event) => event.type === 'TileDestroyed')
    expect(cut.length).toBeGreaterThan(1)
    expect(dig.dug).toHaveLength(1)
    expect(heatOf(dig)).toBe(cutterHeatOfDigTicks(digTicksOf(dig.dug)))
  })

  it('adds no heat with the cutters off, or without the combo', () => {
    expect(heatOf(cutterDig({ engage: false }))).toBe(0)
    expect(heatOf(cutterDig({ owned: [] }))).toBe(0)
  })

  it('names a condenser run with the cutters engaged, beside power_up_used and heat_condensed', () => {
    const dig = cutterDig()
    const pressTick = dig.drillTick + 1
    dig.session.submit(pressTick, { type: 'debug.setEnergy', payload: { energy: '0' } })
    dig.session.submit(pressTick, intentToUseSlot('powerup.1'))
    dig.session.advanceTo(pressTick + AETHERIC_ECONOMY.aetherCondenser.windupTicks + 1)
    const [condensed] = ofType(dig.session, 'aetheric.HeatCondensed')
    const [quenched] = ofType(dig.session, 'aetheric.CuttersQuenched')
    expect(quenched).toMatchObject({ playerId: 'p1', itemId: QUENCH_CUTTERS_ID })
    expect(quenched.tick).toBe(condensed.tick)
    expect('energy' in quenched && quenched.energy).toBe('energy' in condensed && condensed.energy)
    const used = ofType(dig.session, 'power-up-core.PowerUpUsed')
    expect(used.map((event) => 'itemId' in event && event.itemId)).toContain(CONDENSER_ID)
  })

  it("refunds per dig second under a tenth of the drill's draw, at the condenser's own ratio", () => {
    const refundPerSecond = QUENCH.heatUnitsPerDigSecond / CONDENSE_RATIO
    const drillPerSecond = ENERGY_QUANTA_PER_TICK.drill * TICKS_PER_SECOND
    expect(refundPerSecond * 10).toBeLessThanOrEqual(drillPerSecond)
  })
})
