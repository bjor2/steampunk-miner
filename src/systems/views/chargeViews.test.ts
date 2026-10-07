import { describe, expect, it } from 'vitest'
import {
  BACKED_OFF_TILE,
  plantOnWall,
  poseOnTile,
  prepareBlaster,
  setChargesIntent,
  WALL_TILE,
} from '../authority/charges/chargeFixtures'
import { createScriptedSession } from '../authority/scriptedSession'
import { rackSlotPrice, restockPrice } from '../economy/blastingCharges'
import { ACTION_MAP, defaultBindings } from '../input/actionMap'
import { toCanonical } from '../money'
import { buyChargeRackSlotCommand, restockChargesCommand } from '../platform/platformCommands'
import { CLICK_CHAIN } from '../authority/purchaseChain'
import { grantMoneyCommand } from '../startScenarioCommands'
import { teleportToDockCommand } from '../vehicle/vehicleCommands'
import { selectHudModel } from './hudModel'
import { UI_IDS } from './screenIds'
import { selectUpgradeBayModel } from './upgradeBayModel'

type Session = ReturnType<typeof createScriptedSession>

const BINDINGS = defaultBindings(ACTION_MAP)
const NO_UI = {
  isTravelArmed: false,
  isQuickServiceHighlighted: false,
  focusedId: null,
  installingUpgradeId: null,
}

const hudOf = (session: Session, playerId = 'p1') =>
  selectHudModel({ state: session.state(), playerId, depthTiles: 0, bindings: BINDINGS })

const upgradeBayOf = (session: Session) => selectUpgradeBayModel(session.state(), 'p1', NO_UI)

function atUpgradeBayOn(planetIndex: number, money = '1e30'): Session {
  const session = createScriptedSession()
  session.submit(1, { type: 'debug.setPlanet', payload: { planetIndex } })
  session.submit(1, grantMoneyCommand(money))
  session.submit(1, teleportToDockCommand('upgrade'))
  return session
}

describe('HUD: blasting charges (#109)', () => {
  it('shows no charge count before the rack is bolted on', () => {
    expect(hudOf(createScriptedSession()).charges).toBeNull()
  })

  it('reads the charges carried out of the rack with the plant key', () => {
    const session = createScriptedSession()
    session.submit(1, setChargesIntent(2, 1))
    expect(hudOf(session).charges).toEqual({ carried: 2, capacity: 4, text: '2/4 (B)' })
  })

  it('warns the planter inside the blast with the seconds left on the fuse', () => {
    const session = createScriptedSession()
    prepareBlaster(session, 1)
    plantOnWall(session, 2)
    session.advanceTo(32)
    expect(hudOf(session).chargeFuse).toEqual({
      ticksLeft: 90,
      isInsideBlast: true,
      text: 'CHARGE LIT 1.5 s: back off',
    })
  })

  it('still warns a planter that backed out of the blast, without "back off"', () => {
    const session = createScriptedSession()
    prepareBlaster(session, 1)
    plantOnWall(session, 2)
    session.submit(3, poseOnTile(BACKED_OFF_TILE))
    expect(hudOf(session).chargeFuse).toMatchObject({
      isInsideBlast: false,
      text: 'CHARGE LIT 2.0 s',
    })
  })

  it('warns another vehicle within 16 tiles of the charge, and none further', () => {
    const session = createScriptedSession(['p1', 'p2'])
    prepareBlaster(session, 1)
    plantOnWall(session, 2)
    session.submit(3, poseOnTile({ tx: WALL_TILE.tx - 16, ty: WALL_TILE.ty }), 'p2')
    expect(hudOf(session, 'p2').chargeFuse?.isInsideBlast).toBe(false)
    session.submit(4, poseOnTile({ tx: WALL_TILE.tx - 17, ty: WALL_TILE.ty }), 'p2')
    expect(hudOf(session, 'p2').chargeFuse).toBeNull()
  })

  it('clears the warning once the charge has blown', () => {
    const session = createScriptedSession()
    prepareBlaster(session, 1)
    plantOnWall(session, 2)
    session.advanceTo(2 + 120)
    expect(hudOf(session).chargeFuse).toBeNull()
  })
})

describe('upgrade bay model: the charge rows (#109)', () => {
  it('shows no charge rows before blasting_charges opens on planet 7 (#90: nothing before)', () => {
    expect(upgradeBayOf(atUpgradeBayOn(6)).charges).toBeNull()
  })

  it('offers the rack with three charges on planet 7 at two band-5 units each', () => {
    const charges = upgradeBayOf(atUpgradeBayOn(7)).charges
    expect(charges?.restock).toMatchObject({
      iconId: 'icon-blasting-charges',
      label: 'Charges',
      levelText: '0/3',
      effectText: '+3 charges',
      cost: { exact: toCanonical(restockPrice(3, 7)) },
      buy: { id: UI_IDS.upgradebayChargesRestock, label: 'Buy rack', reason: null },
    })
    expect(charges?.rack).toMatchObject({
      label: 'Rack',
      levelText: '3 → 4',
      cost: { exact: toCanonical(rackSlotPrice(0, 7)) },
      buy: { id: UI_IDS.upgradebayRackBuy, reason: null },
    })
  })

  it('says the rack is full after a restock, its Buy carrying rack_full', () => {
    const session = atUpgradeBayOn(7)
    session.submit(2, restockChargesCommand())
    expect(upgradeBayOf(session).charges?.restock).toMatchObject({
      levelText: '3/3',
      effectText: 'rack full',
      buy: { label: 'Restock', reason: 'rack_full' },
    })
  })

  it('says top size at the last slot, with no price, and carries max_level', () => {
    const session = atUpgradeBayOn(7)
    for (let slot = 0; slot < 5; slot += 1) session.submit(2, buyChargeRackSlotCommand(CLICK_CHAIN))
    expect(upgradeBayOf(session).charges?.rack).toMatchObject({
      levelText: '8 (top)',
      cost: null,
      buy: { reason: 'max_level' },
    })
  })

  it('visits Restock and the rack slot after the Guns row in focus order', () => {
    const ids = upgradeBayOf(atUpgradeBayOn(7)).focusStops.map((stop) => stop.id)
    const restockAt = ids.indexOf(UI_IDS.upgradebayChargesRestock)
    expect(ids.indexOf(UI_IDS.upgradebayGunsBuy)).toBeLessThan(restockAt)
    expect(ids[restockAt + 1]).toBe(UI_IDS.upgradebayRackBuy)
  })
})
