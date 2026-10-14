import { describe, expect, it } from 'vitest'
import { ENERGY_QUANTA_PER_UNIT } from '../../constants/balance'
import { CONDENSE_RATIO } from '../../systems/aetheric/condense'
import { prepareCorridor } from '../../systems/authority/combat/combatFixtures'
import { setVehicleLoadoutCommand } from '../../systems/authority/loadoutCommands'
import {
  createScriptedSession,
  type ScriptedSession,
} from '../../systems/authority/scriptedSession'
import { FACING } from '../../systems/vehicle/vehiclePose'
import { energyMaxQuantaOf } from '../../systems/vehicle/vehicleState'
import { chargesLeftOf, intentToUseSlot } from '../power-up-core'
import { AETHERIC_ECONOMY } from './systems/aethericEconomy'
import { NO_HEAT, TANK_FULL } from './systems/aethericEvents'
import { CONDENSER_ID } from './systems/condenserItem'
import { GOVERNOR_ID } from './systems/governorItem'
import { itemHeatUnitsAt } from './systems/itemHeat'

// The aether condenser in play on the loaded slices (#263, the GD lock on #245 "condense"): a slot
// tap burns the off-act item heat gauge down into the tank at the kernel's ratio (#360), stopping
// at full charge. Set up in the corridor of `combatFixtures.ts` with the scenario's item heat and
// tank, with no enemy about.

const CONDENSER = AETHERIC_ECONOMY.aetherCondenser
const GOVERNOR = AETHERIC_ECONOMY.chronometricGovernor
const EFFECT_TICKS = 6
/** A tank a few units from empty, so the burn has room. */
const LOW_TANK_UNITS = 2

interface Burn {
  session: ScriptedSession
  pressTick: number
  actTick: number
  energyBefore: number
}

/** The condenser in `powerup.1` with `heat` units on the gauge and `energy` units in the tank. */
function condenseFrom({ heat, energy }: { heat: number; energy: string }): Burn {
  const session = createScriptedSession()
  const start = prepareCorridor(session, FACING.right)
  session.submit(start, setVehicleLoadoutCommand({ 'powerup.1': CONDENSER_ID }))
  session.submit(start, { type: 'debug.setEnergy', payload: { energy } })
  session.submit(start, { type: 'debug.aetheric.setItemHeat', payload: { heat } })
  const energyBefore = session.vehicle().energy
  const pressTick = start + 1
  session.submit(pressTick, intentToUseSlot('powerup.1'))
  session.advanceTo(pressTick + EFFECT_TICKS)
  return { session, pressTick, actTick: pressTick + CONDENSER.windupTicks, energyBefore }
}

/** The corridor vehicle's full tank, in whole units. */
function fullTankUnits(): number {
  const session = createScriptedSession()
  prepareCorridor(session, FACING.right)
  return energyMaxQuantaOf(session.vehicle()) / ENERGY_QUANTA_PER_UNIT
}

/** The scenario's heat as it stands at the act: set the tick before the press, then cooled. */
function cooledToAct(heat: number): number {
  return heat - AETHERIC_ECONOMY.itemHeat.coolingUnitsPerTick * (CONDENSER.windupTicks + 1)
}

function heatAt(burn: Burn, tick: number): number {
  return itemHeatUnitsAt(burn.session.state(), 'p1', tick)
}

function eventsOfType(session: ScriptedSession, type: string) {
  return session.events().filter((event) => event.type === type)
}

describe('aether condenser', () => {
  it('burns the gauge’s heat into energy at the json ratio, within 6 ticks of the press', () => {
    const heat = GOVERNOR.heatUnits
    const burn = condenseFrom({ heat, energy: String(LOW_TANK_UNITS) })
    expect(heatAt(burn, burn.pressTick + EFFECT_TICKS)).toBe(0)
    const heatAtAct = cooledToAct(heat)
    expect(burn.session.vehicle().energy - burn.energyBefore).toBe(
      Math.floor(heatAtAct / CONDENSE_RATIO),
    )
  })

  it('stops at full charge, leaving the heat it could not burn on the gauge', () => {
    const heat = AETHERIC_ECONOMY.itemHeat.gaugeMaxUnits
    const burn = condenseFrom({ heat, energy: String(fullTankUnits() - 1) })
    const energyMax = energyMaxQuantaOf(burn.session.vehicle())
    const room = energyMax - burn.energyBefore
    expect(Math.floor(heat / CONDENSE_RATIO)).toBeGreaterThan(room)
    expect(burn.session.vehicle().energy).toBe(energyMax)
    const heatAtAct = cooledToAct(heat)
    expect(heatAt(burn, burn.actTick)).toBe(heatAtAct - room * CONDENSE_RATIO)
  })

  it('logs one heat_condensed beside power_up_used, on the act tick, and spends a charge', () => {
    const burn = condenseFrom({ heat: GOVERNOR.heatUnits, energy: String(LOW_TANK_UNITS) })
    const gained = burn.session.vehicle().energy - burn.energyBefore
    expect(eventsOfType(burn.session, 'power-up-core.PowerUpUsed')).toMatchObject([
      { tick: burn.actTick, itemId: CONDENSER_ID },
    ])
    expect(eventsOfType(burn.session, 'aetheric.HeatCondensed')).toEqual([
      {
        tick: burn.actTick,
        type: 'aetheric.HeatCondensed',
        playerId: 'p1',
        itemId: CONDENSER_ID,
        heat: gained * CONDENSE_RATIO,
        energy: gained,
      },
    ])
    expect(chargesLeftOf(burn.session.state(), 'p1', CONDENSER_ID)).toBe(CONDENSER.charges - 1)
  })

  it('is refused no_heat on a cold gauge, spending nothing', () => {
    const burn = condenseFrom({ heat: 0, energy: String(LOW_TANK_UNITS) })
    expect(eventsOfType(burn.session, 'power-up-core.PowerUpRefused')).toMatchObject([
      { itemId: CONDENSER_ID, reason: NO_HEAT },
    ])
    expect(burn.session.vehicle().energy).toBe(burn.energyBefore)
    expect(chargesLeftOf(burn.session.state(), 'p1', CONDENSER_ID)).toBe(CONDENSER.charges)
  })

  it('is refused tank_full on a full tank, leaving the heat where it was', () => {
    const burn = condenseFrom({ heat: GOVERNOR.heatUnits, energy: String(fullTankUnits()) })
    expect(eventsOfType(burn.session, 'power-up-core.PowerUpRefused')).toMatchObject([
      { itemId: CONDENSER_ID, reason: TANK_FULL },
    ])
    expect(eventsOfType(burn.session, 'aetheric.HeatCondensed')).toEqual([])
    expect(heatAt(burn, burn.actTick)).toBe(cooledToAct(GOVERNOR.heatUnits))
    expect(chargesLeftOf(burn.session.state(), 'p1', CONDENSER_ID)).toBe(CONDENSER.charges)
  })

  it('gives back less energy than the governor’s pocket took, so the pair never makes energy', () => {
    const pocketEnergy = GOVERNOR.energyQuantaPerTick * GOVERNOR.durationTicks
    expect(Math.floor(GOVERNOR.heatUnits / CONDENSE_RATIO)).toBeLessThan(pocketEnergy)
  })

  it('refuses a scenario heat above the gauge’s max', () => {
    const session = createScriptedSession()
    const start = prepareCorridor(session, FACING.right)
    session.submit(start, setVehicleLoadoutCommand({ 'powerup.1': GOVERNOR_ID }))
    const answer = session.submit(start, {
      type: 'debug.aetheric.setItemHeat',
      payload: { heat: AETHERIC_ECONOMY.itemHeat.gaugeMaxUnits + 1 },
    })
    expect(answer).toMatchObject([{ type: 'CommandRejected', reason: 'out_of_range' }])
    expect(itemHeatUnitsAt(session.state(), 'p1', start)).toBe(0)
  })
})
