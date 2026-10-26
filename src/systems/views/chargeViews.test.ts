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
import { blastRadiusLevelPrice, rackSlotPrice } from '../economy/blastingCharges'
import { chargePrice } from '../economy/chargeSizes'
import { KEYBOARD_PROMPTS } from '../input/promptFixtures'
import { toCanonical } from '../money'
import {
  buyBlastRadiusLevelCommand,
  buyChargeRackSlotCommand,
  restockChargesCommand,
} from '../platform/platformCommands'
import { CLICK_CHAIN } from '../authority/purchaseChain'
import { grantMoneyCommand } from '../startScenarioCommands'
import { teleportToDockCommand } from '../vehicle/vehicleCommands'
import { selectHudModel } from './hudModel'
import { UI_ID_TEMPLATES, UI_IDS } from './screenIds'
import { selectUpgradeBayModel } from './upgradeBayModel'

type Session = ReturnType<typeof createScriptedSession>

const NO_UI = {
  isQuickServiceHighlighted: false,
  focusedId: null,
  installingUpgradeId: null,
}

const hudOf = (session: Session, playerId = 'p1') =>
  selectHudModel({ state: session.state(), playerId, depthTiles: 0, prompts: KEYBOARD_PROMPTS })

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

  it('reads the slots the charges fill, two for each size-4 charge (#218)', () => {
    const session = createScriptedSession()
    session.submit(1, setChargesIntent(2, 1, 4))
    expect(hudOf(session).charges).toEqual({ carried: 2, capacity: 4, text: '4/4 (B)' })
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
  it('shows the charge rows on planet 1: every size, price the only gate (D4 #863)', () => {
    expect(upgradeBayOf(atUpgradeBayOn(1)).charges.restock).toHaveLength(12)
  })

  it('offers the rack with three charges on planet 7 at two band-5 units each', () => {
    const charges = upgradeBayOf(atUpgradeBayOn(7)).charges
    expect(charges.restock).toHaveLength(12)
    expect(charges.restock[0]).toMatchObject({
      iconId: 'icon-blasting-charges',
      label: 'Charges',
      levelText: '0/3',
      effectText: '+3 charges',
      cost: { exact: toCanonical(chargePrice(1, 3, 7)) },
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
    session.submit(2, restockChargesCommand(1, 3))
    expect(upgradeBayOf(session).charges.restock[0]).toMatchObject({
      levelText: '3/3',
      effectText: 'rack full',
      buy: { label: 'Restock', reason: 'rack_full' },
    })
  })

  it('says top size at the last slot, with no price, and carries max_level', () => {
    const session = atUpgradeBayOn(7)
    for (let slot = 0; slot < 5; slot += 1) session.submit(2, buyChargeRackSlotCommand(CLICK_CHAIN))
    expect(upgradeBayOf(session).charges.rack).toMatchObject({
      levelText: '8 (top)',
      cost: null,
      buy: { reason: 'max_level' },
    })
  })

  it('offers a row per size, smallest first, each under its own ids (#218, D4 #863)', () => {
    const rows = upgradeBayOf(atUpgradeBayOn(10)).charges.restock
    expect(rows.map((row) => row.label).slice(0, 3)).toEqual([
      'Charges',
      'Charges size 2',
      'Charges size 3',
    ])
    expect(rows.at(-1)?.label).toBe('Charges size 12')
    expect(rows?.[1]).toMatchObject({
      key: 'charges-2',
      levelText: '0/3',
      cost: { exact: toCanonical(chargePrice(2, 3, 10)) },
      buy: { id: UI_ID_TEMPLATES.upgradebayChargeSizeRestock(2), reason: null },
    })
  })

  it('offers only the size-4 charges that fit the free slots (#218)', () => {
    const session = atUpgradeBayOn(16)
    session.submit(2, restockChargesCommand(1, 1))
    expect(upgradeBayOf(session).charges.restock[3]).toMatchObject({
      label: 'Charges size 4',
      levelText: '0/1',
      effectText: '+1 charges',
      cost: { exact: toCanonical(chargePrice(4, 1, 16)) },
    })
  })

  it('visits every Restock and then the rack slot after the Guns row in focus order', () => {
    const ids = upgradeBayOf(atUpgradeBayOn(7)).focusStops.map((stop) => stop.id)
    const restockAt = ids.indexOf(UI_IDS.upgradebayChargesRestock)
    expect(ids.indexOf(UI_IDS.upgradebayGunsBuy)).toBeLessThan(restockAt)
    expect(ids[restockAt + 1]).toBe(UI_ID_TEMPLATES.upgradebayChargeSizeRestock(2))
    expect(ids[restockAt + 12]).toBe(UI_IDS.upgradebayRackBuy)
    expect(ids[restockAt + 13]).toBe(UI_IDS.upgradebayBlastRadiusBuy)
  })
})

describe('upgrade bay model: the Blast Radius row (D9 #869)', () => {
  it('offers level 0 → 1 on planet 1 at the track price, with no rack bolted on', () => {
    expect(upgradeBayOf(atUpgradeBayOn(1)).charges.radius).toMatchObject({
      key: 'blast-radius',
      iconId: 'icon-blast-radius',
      label: 'Blast Radius',
      levelText: '0 → 1',
      effectText: '×1.03 blast radius',
      cost: { exact: toCanonical(blastRadiusLevelPrice(0, 1)) },
      badge: null,
      buy: { id: UI_IDS.upgradebayBlastRadiusBuy, label: 'Buy', reason: null },
    })
  })

  it('climbs a level a buy and never tops out, its Buy closed only by the wallet', () => {
    const session = atUpgradeBayOn(1)
    session.submit(2, buyBlastRadiusLevelCommand(CLICK_CHAIN))
    expect(upgradeBayOf(session).charges.radius).toMatchObject({
      levelText: '1 → 2',
      effectText: '×1.06 blast radius',
      cost: { exact: toCanonical(blastRadiusLevelPrice(1, 1)) },
    })
    const broke = atUpgradeBayOn(1, '0')
    expect(upgradeBayOf(broke).charges.radius.buy.reason).toBe('money_short')
  })

  it('reads ×250 at level 1e6: every blast clears 250 times its rung, its danger zone kept', () => {
    const session = atUpgradeBayOn(1)
    session.submit(2, { type: 'debug.setBlastRadiusLevel', payload: { level: 999_999 } })
    expect(upgradeBayOf(session).charges.radius).toMatchObject({
      levelText: '999999 → 1000000',
      effectText: '×250.00 blast radius',
    })
  })
})
