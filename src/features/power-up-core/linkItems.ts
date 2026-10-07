/**
 * Fake linked power-ups for the sibling-link specs (ticket 274, the GD lock on #256), registered
 * beside the slice the way an item slice will, with tech nodes whose Mark ladders carry a
 * sibling-link at Mark 3. The tech tree's save section and commands are the loaded slice's own,
 * copied into the fresh set, so `debug.tech-tree.unlockThrough` researches the fakes' Marks as a
 * jump to depth does. Spec-only: no register.ts imports this.
 *
 * - The boost (charged) pays its user one coin when it acts; Mark 3 links it to the ballast.
 * - The ballast (consumable) pays its magnitude in coins, so a spec sees the link's strength in
 *   the wallet; a gate refuses it facing down, and it finds nothing to act on facing up.
 * - The horn (charged) links to the lamp, a toggle that counts no charges.
 * - The bell (charged) links to an item that is still a vision row: never registered.
 * - The curtain (charged) links to the ballast at a moment of its own (`linkMoment: 'own'`), as the
 *   steam shield's break does (ticket 275): never on its act.
 */
import { withRegistrations } from '../../registries/registrar'
import type { SliceDefinition } from '../../registries/sliceDefinition'
import { add, fromSafeInteger } from '../../systems/money'
import { withWallet, type AuthorityState } from '../../systems/authority/authorityState'
import type { CommandIntent } from '../../systems/authority/authorityCommand'
import { setVehicleLoadoutCommand } from '../../systems/authority/loadoutCommands'
import {
  createScriptedSession,
  GROUND,
  poseAbove,
  type ScriptedSession,
} from '../../systems/authority/scriptedSession'
import { COMMAND_RULE_REGISTRY } from '../../systems/registries/commandRules'
import { SAVE_SECTION_REGISTRY } from '../../systems/registries/saveSections'
import {
  addToRegistry,
  registrationsOf,
  type Registry,
  type RegistryEntry,
} from '../../systems/registries/seal'
import type { VehicleItem } from '../../systems/registries/vehicleLoadout'
import { FACING, type Facing } from '../../systems/vehicle/vehiclePose'
import { TECH_TREE_SLICE_ID, type MarkLadder, type TechNode } from '../tech-tree'
import { slice } from './register'
import type { PowerUp, PowerUpClass, PowerUpOutcome, PowerUpUse } from './systems/powerUpKind'
import { POWER_UP_SLOTS } from './systems/powerUpSlots'

export const LINKED = {
  boost: 'link-items.boost',
  ballast: 'link-items.ballast',
  horn: 'link-items.horn',
  lamp: 'link-items.lamp',
  bell: 'link-items.bell',
  curtain: 'link-items.curtain',
  visionRow: 'link-items.vision_row',
} as const

/** Every link sits at Mark 3 (#256: charged items link at M9; any milestone Mark serves here). */
export const LINK_MARK = 3

/** A tier-1 capability's Mark 3 is researchable from planet 7, Mark 2 from planet 4. */
export const LINK_PLANET = 7
export const MARK_2_PLANET = 4

/** The ballast's cooldown: it starts when a link fires the ballast. */
export const BALLAST_COOLDOWN_TICKS = 120

/** Why an upward-facing ballast is refused: nothing above it to act on. */
export const BALLAST_REFUSAL = 'link-items.nothing_above'

const LINKS: Readonly<Record<string, string>> = {
  [LINKED.boost]: LINKED.ballast,
  [LINKED.horn]: LINKED.lamp,
  [LINKED.bell]: LINKED.visionRow,
  [LINKED.curtain]: LINKED.ballast,
}

interface LinkedNumbers {
  powerUpClass: PowerUpClass
  charges: number
  cooldownTicks: number
  isToggle: boolean
  ladder: MarkLadder
  activate(state: AuthorityState, use: PowerUpUse): PowerUpOutcome
  linkMoment?: PowerUp['linkMoment']
}

const LINKED_NUMBERS: Readonly<Record<string, LinkedNumbers>> = {
  [LINKED.boost]: charged(),
  [LINKED.horn]: charged(),
  [LINKED.bell]: charged(),
  [LINKED.curtain]: { ...charged(), linkMoment: 'own' },
  [LINKED.ballast]: {
    powerUpClass: 'consumable',
    charges: 3,
    cooldownTicks: BALLAST_COOLDOWN_TICKS,
    isToggle: false,
    ladder: { isIncomeItem: false, magnitude: { base: 40 }, charges: 3 },
    activate: payMagnitudeUnlessFacingUpOrDown,
  },
  [LINKED.lamp]: {
    powerUpClass: 'passive',
    charges: 0,
    cooldownTicks: 0,
    isToggle: true,
    ladder: { isIncomeItem: false, magnitude: { base: 10 } },
    activate: payOneCoin,
  },
}

const LINK_ITEMS: SliceDefinition = {
  id: 'link-items',
  register(r) {
    const itemIds = Object.keys(LINKED_NUMBERS)
    r.content('vehicle-item', itemIds.map(linkedItemOf))
    r.content('power-up', itemIds.map(linkedPowerUpOf))
    r.content('tech-node', itemIds.map(techNodeOf))
  },
}

export interface LinkFieldSetup {
  slots?: Readonly<Record<string, string>>
  facing?: Facing
  /** The planet whose nodes are researched at tick 1: the link's by default. */
  researchedThrough?: number
}

/**
 * Runs `body` with the slice, the fakes and the tech tree's rules registered, on a planet-1 session
 * with the boost in slot 1 and the ballast in slot 2 by default, everything through
 * `researchedThrough` researched, and the vehicle at rest on open ground from tick 1.
 */
export function inLinkField<T>(
  body: (session: ScriptedSession) => T,
  setup: LinkFieldSetup = {},
): T {
  const { slots = { 'powerup.1': LINKED.boost, 'powerup.2': LINKED.ballast } } = setup
  const techTreeRules = loadedTechTreeRules()
  return withRegistrations([slice, LINK_ITEMS, techTreeRules], () => {
    const session = createScriptedSession()
    session.submit(0, setVehicleLoadoutCommand(slots))
    session.submit(1, researchThrough(setup.researchedThrough ?? LINK_PLANET))
    session.submit(1, poseAbove(GROUND, setup.facing ?? FACING.right))
    return body(session)
  })
}

export function researchThrough(planetIndex: number): CommandIntent {
  return { type: 'debug.tech-tree.unlockThrough', payload: { planetIndex } } as CommandIntent
}

/**
 * The loaded tech tree's save section and command rules as a slice for the fresh set: read from
 * the loaded registries before the swap, since a slice may import another only through its index.
 */
function loadedTechTreeRules(): SliceDefinition {
  const sections = loadedRegistrationsOf(SAVE_SECTION_REGISTRY)
  const rules = loadedRegistrationsOf(COMMAND_RULE_REGISTRY)
  return {
    id: TECH_TREE_SLICE_ID,
    register() {
      sections.forEach((section) =>
        addToRegistry(SAVE_SECTION_REGISTRY, TECH_TREE_SLICE_ID, section),
      )
      rules.forEach((rule) => addToRegistry(COMMAND_RULE_REGISTRY, TECH_TREE_SLICE_ID, rule))
    },
  }
}

function loadedRegistrationsOf<T extends RegistryEntry>(registry: Registry<T>): T[] {
  return registrationsOf(registry)
    .filter(({ sliceId }) => sliceId === TECH_TREE_SLICE_ID)
    .map(({ entry }) => entry)
}

function charged(): LinkedNumbers {
  return {
    powerUpClass: 'charged',
    charges: 2,
    cooldownTicks: 30,
    isToggle: false,
    ladder: { isIncomeItem: false, cooldown: 30, magnitude: { base: 10 }, charges: 2 },
    activate: payOneCoin,
  }
}

function linkedItemOf(itemId: string): VehicleItem {
  return { id: itemId, iconId: 'icon-panel-slots', slots: POWER_UP_SLOTS, attach: null }
}

function linkedPowerUpOf(itemId: string): PowerUp {
  const { ladder: _ladder, ...numbers } = LINKED_NUMBERS[itemId]
  return {
    id: `${itemId}.power-up`,
    itemId,
    iconId: 'icon-panel-slots',
    name: itemId,
    windupTicks: 0,
    channelTicks: 0,
    energyDrawBpPerSecond: 0,
    ...numbers,
  }
}

function techNodeOf(itemId: string): TechNode {
  return {
    id: `${itemId}.node`,
    iconId: 'icon-panel-slots',
    lane: 'mobility',
    name: itemId,
    unlockTier: 1,
    prereqs: [],
    unlocks: itemId,
    description: 'A linked fake.',
    label: 'vertical',
    costKind: 'capability',
    marks: ladderOf(itemId),
  }
}

function ladderOf(itemId: string): MarkLadder {
  const { ladder } = LINKED_NUMBERS[itemId]
  const siblingId = LINKS[itemId]
  if (siblingId === undefined) return ladder
  const link = { mark: LINK_MARK, pattern: 'sibling-link' as const, verb: 'fires its sibling' }
  return { ...ladder, milestones: [{ ...link, siblingId }] }
}

function payOneCoin(state: AuthorityState, use: PowerUpUse): PowerUpOutcome {
  return pay(state, use.playerId, 1)
}

function payMagnitudeUnlessFacingUpOrDown(state: AuthorityState, use: PowerUpUse): PowerUpOutcome {
  const facing = state.players[use.playerId].vehicle.pose?.facing
  if (facing === FACING.down) {
    const block = { cellTier: 9, gateKind: 'drill_tier', tx: use.origin.tx, ty: use.origin.ty - 1 }
    return { kind: 'blocked', block }
  }
  if (facing === FACING.up) return { kind: 'refused', reason: BALLAST_REFUSAL }
  return pay(state, use.playerId, use.magnitude ?? 1)
}

function pay(state: AuthorityState, playerId: string, coins: number): PowerUpOutcome {
  const wallet = add(state.players[playerId].wallet, fromSafeInteger(coins))
  return { kind: 'acted', effect: { state: withWallet(state, playerId, wallet), events: [] } }
}
