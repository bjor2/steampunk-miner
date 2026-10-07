/**
 * Fake power-ups for the slice's specs (#200 acceptance: "fake charged, channel, passive and
 * consumable items"): one of each class, registered by a fixture slice beside the real one, the
 * way an item slice will. Each pays its user one coin when it acts, so a spec sees the effect in
 * the wallet; each is refused by a gate when the vehicle faces down, as if the cell below were
 * gated, and finds nothing to act on when it faces up. Spec-only: no register.ts imports this.
 */
import { withRegistrations } from '../../registries/registrar'
import type { SliceDefinition } from '../../registries/sliceDefinition'
import { add, fromSafeInteger } from '../../systems/money'
import { withWallet, type AuthorityState } from '../../systems/authority/authorityState'
import { setVehicleLoadoutCommand } from '../../systems/authority/loadoutCommands'
import {
  createScriptedSession,
  GROUND,
  poseAbove,
  type ScriptedSession,
} from '../../systems/authority/scriptedSession'
import { FACING, type Facing } from '../../systems/vehicle/vehiclePose'
import { slice } from './register'
import type { VehicleItem } from '../../systems/registries/vehicleLoadout'
import type { PowerUp, PowerUpClass, PowerUpOutcome, PowerUpUse } from './systems/powerUpKind'
import { POWER_UP_SLOTS } from './systems/powerUpSlots'

export const FAKE = {
  charged: 'fake-items.charged',
  channel: 'fake-items.channel',
  consumable: 'fake-items.consumable',
  toggle: 'fake-items.toggle',
  drawingToggle: 'fake-items.drawing-toggle',
  extractor: 'fake-items.extractor',
} as const

/** The drawing toggle's draw: 1.5% of `energyMax` a second, the buoyancy tanks' (#162 4.4). */
export const FAKE_DRAW_PER_MILLE = 15

/** The cell a downward-facing fake aims at is a tier-9 drill gate. */
export const FAKE_GATE = { cellTier: 9, gateKind: 'drill_tier' } as const

/** Why an upward-facing fake is refused: nothing above it to act on. */
export const FAKE_REFUSAL = 'fake-items.nothing_above'

interface FakeNumbers {
  powerUpClass: PowerUpClass
  charges: number
  cooldownTicks: number
  windupTicks: number
  channelTicks: number
  isToggle: boolean
  energyDrawPerMillePerSecond: number
}

const FAKE_NUMBERS: Readonly<Record<string, FakeNumbers>> = {
  [FAKE.charged]: numbers('charged', { charges: 2, cooldownTicks: 30, windupTicks: 6 }),
  [FAKE.channel]: numbers('channel', { charges: 2, cooldownTicks: 90, channelTicks: 60 }),
  [FAKE.consumable]: numbers('consumable', { charges: 3, windupTicks: 4 }),
  [FAKE.toggle]: numbers('passive', { isToggle: true }),
  [FAKE.drawingToggle]: numbers('passive', {
    isToggle: true,
    energyDrawPerMillePerSecond: FAKE_DRAW_PER_MILLE,
  }),
  [FAKE.extractor]: numbers('extractor', {}),
}

export const FAKE_ITEMS: SliceDefinition = {
  id: 'fake-items',
  register(r) {
    r.content('vehicle-item', Object.keys(FAKE_NUMBERS).map(fakeItemOf))
    r.content('power-up', Object.keys(FAKE_NUMBERS).map(fakePowerUpOf))
  },
}

export interface FieldSetup {
  slots?: Readonly<Record<string, string>>
  /** Owned vehicle items beside the slotted ones: cradles open their slots. */
  owned?: readonly string[]
  facing?: Facing
}

/**
 * Runs `body` with the slice and the fakes registered, on a planet-1 session with the fakes in
 * `slots` (the charged one in slot 1 and the channel in slot 2 by default) and the vehicle at rest
 * on open ground from tick 1.
 */
export function inField<T>(body: (session: ScriptedSession) => T, setup: FieldSetup = {}): T {
  const { slots = { 'powerup.1': FAKE.charged, 'powerup.2': FAKE.channel }, owned = [] } = setup
  return withRegistrations([slice, FAKE_ITEMS], () => {
    const session = createScriptedSession()
    session.submit(0, setVehicleLoadoutCommand(slots, owned))
    session.submit(1, poseAbove(GROUND, setup.facing ?? FACING.right))
    return body(session)
  })
}

function numbers(powerUpClass: PowerUpClass, values: Partial<FakeNumbers>): FakeNumbers {
  const none = {
    charges: 0,
    cooldownTicks: 0,
    windupTicks: 0,
    channelTicks: 0,
    isToggle: false,
    energyDrawPerMillePerSecond: 0,
  }
  return { ...none, ...values, powerUpClass }
}

function fakeItemOf(itemId: string): VehicleItem {
  return { id: itemId, iconId: 'icon-panel-slots', slots: POWER_UP_SLOTS, attach: null }
}

function fakePowerUpOf(itemId: string): PowerUp {
  return {
    id: `${itemId}.power-up`,
    itemId,
    iconId: 'icon-panel-slots',
    name: itemId,
    ...FAKE_NUMBERS[itemId],
    activate: payOneCoinUnlessFacingDown,
  }
}

function payOneCoinUnlessFacingDown(state: AuthorityState, use: PowerUpUse): PowerUpOutcome {
  const vehicle = state.players[use.playerId].vehicle
  if (vehicle.pose?.facing === FACING.down) {
    return { kind: 'blocked', block: { ...FAKE_GATE, tx: use.origin.tx, ty: use.origin.ty - 1 } }
  }
  if (vehicle.pose?.facing === FACING.up) return { kind: 'refused', reason: FAKE_REFUSAL }
  const wallet = add(state.players[use.playerId].wallet, fromSafeInteger(1))
  return { kind: 'acted', effect: { state: withWallet(state, use.playerId, wallet), events: [] } }
}
