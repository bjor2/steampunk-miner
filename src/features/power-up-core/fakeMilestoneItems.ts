/**
 * Fake Mark-milestone items for the slice's specs (#256, build 2): a charged dasher whose Mark 3
 * second tap is a sideways air-dash and whose Mark 6 hold is a longer burn, as the lock's steam
 * boost, and a toggle whose Mark 3 hold and Mark 6 second tap name their own verbs and whose Mark 9
 * sibling-link fires the dasher (ticket 274). Each is a
 * capability on the tech tree with its Mark ladder, so a spec researches its Marks through the
 * tree's own debug grant. Every act is noted in the fixture's section, which is all a spec reads
 * of the verb, and the dasher's notes drive the vehicle through `vehicleMotionEffects`, so a spec
 * can see the air-dash folded under the #233 caps. Spec-only: no register.ts imports this.
 */
import { registerSlices } from '../../registries/registrar'
import type { SliceDefinition } from '../../registries/sliceDefinition'
import { setVehicleLoadoutCommand } from '../../systems/authority/loadoutCommands'
import type { AuthorityState } from '../../systems/authority/authorityState'
import type { AuthorityCommand, CommandIntent } from '../../systems/authority/authorityCommand'
import {
  createScriptedSession,
  GROUND,
  poseAbove,
  type ScriptedSession,
} from '../../systems/authority/scriptedSession'
import { readSection, withSection, type SaveSection } from '../../systems/registries/saveSections'
import {
  addToRegistry,
  swapRegistrySet,
  createRegistrySet,
  withFreshRegistrySet,
  type RegistrySet,
} from '../../systems/registries/seal'
import type { VehicleItem } from '../../systems/registries/vehicleLoadout'
import type { VehicleMotionEffect } from '../../systems/registries/vehicleMotionEffects'
import { FACING } from '../../systems/vehicle/vehiclePose'
import type { MarkLadder, TechNode } from '../tech-tree'
import { slice } from './register'
import type { PowerUp, PowerUpOutcome, PowerUpUse } from './systems/powerUpKind'
import { POWER_UP_SLOTS } from './systems/powerUpSlots'

const SLICE_ID = 'fake-milestones'

export const DASHER = `${SLICE_ID}.dasher`
export const SWITCH = `${SLICE_ID}.switch`

/** The dasher's numbers: the steam boost's 3 charges, 240-tick cooldown and 6-tick wind-up. */
export const DASHER_COOLDOWN_TICKS = 240
export const DASHER_WINDUP_TICKS = 6
const DASHER_CHARGES = 3

/** What each act of a fake did, by the milestone it was. */
export const VERBS = {
  [DASHER]: { plain: 'boost', 'second-tap': 'air-dash', hold: 'long-burn' },
  [SWITCH]: { plain: 'switch-on', 'second-tap': 'one-pass', hold: 'faced-side' },
} as const

/**
 * The air-dash asks for more than the caps allow on both axes (+5000 bp against +2000), so a spec
 * sees the fold hold it; the boost asks for 1500 bp of drive, which the dash stacks on.
 */
export const AIR_DASH_ASK_BP = 5000
const BOOST_DRIVE_BP = 1500
const EFFECT_TICKS = 30

/** A gated cell below a fake facing down, as the core's own fakes (`fakeItems.ts`). */
const FAKE_GATE = { cellTier: 9, gateKind: 'drill_tier' } as const

/** Each capability sits on planet 1, so Mark N is researchable from planet 1 + 3 (N - 1). */
export const RESEARCH_PLANET_OF_MARK: Readonly<Record<number, number>> = {
  1: 1,
  2: 4,
  3: 7,
  5: 13,
  6: 16,
  9: 25,
}

export interface FakeAct {
  itemId: string
  verb: string
  tick: number
  /** The use's Mark numbers as the core handed them: a follow-up gets the plain use's. */
  mark: number
  magnitude: number | null
}

interface FakeActs {
  acts: readonly FakeAct[]
}

const ACTS_SECTION: SaveSection<FakeActs> = {
  id: SLICE_ID,
  version: 1,
  scope: 'player',
  initial: { acts: [] },
  problems: () => [],
  toPortable: (value) => value,
  ofPortable: (body) => body as FakeActs,
}

const LADDERS: Readonly<Record<string, MarkLadder>> = {
  [DASHER]: {
    isIncomeItem: false,
    cooldown: DASHER_COOLDOWN_TICKS,
    magnitude: { base: EFFECT_TICKS },
    charges: DASHER_CHARGES,
    milestones: [
      { mark: 3, pattern: 'second-tap', verb: 'a sideways air-dash' },
      { mark: 6, pattern: 'hold', verb: 'a longer burn' },
    ],
  },
  [SWITCH]: {
    isIncomeItem: false,
    cooldown: 100,
    milestones: [
      { mark: 3, pattern: 'hold', verb: 'cuts the faced side only' },
      { mark: 6, pattern: 'second-tap', verb: 'one pass, then off' },
      { mark: 9, pattern: 'sibling-link', verb: 'fires the dasher', siblingId: DASHER },
    ],
  },
}

const FAKE_MILESTONE_ITEMS: SliceDefinition = {
  id: SLICE_ID,
  register(r) {
    r.content('vehicle-item', [DASHER, SWITCH].map(vehicleItemOf))
    r.content('power-up', [dasherOf(), switchOf()])
    r.content('tech-node', [DASHER, SWITCH].map(techNodeOf))
    r.saveSection(ACTS_SECTION)
    r.vehicleMotionEffect({ id: `${SLICE_ID}.dasher-motion`, effectOf: dasherMotionOf })
  },
}

/** A scripted session that keeps the commands it was given, so a spec can replay them. */
export interface MarkedField extends ScriptedSession {
  commands: readonly AuthorityCommand[]
}

/**
 * Runs `body` with the core slice, the tech tree as the game loads it and the fakes registered,
 * on a planet-1 session with the fakes slotted (the dasher in slot 1, the switch in slot 2) and
 * the vehicle at rest on open ground from tick 1, every node through `mark` researched.
 */
export function inMarkedField<T>(mark: number, body: (field: MarkedField) => T): T {
  return withTreeAndFakes(() => {
    const field = recordingSession()
    field.submit(0, setVehicleLoadoutCommand({ 'powerup.1': DASHER, 'powerup.2': SWITCH }))
    field.submit(0, researchThrough(RESEARCH_PLANET_OF_MARK[mark]))
    field.submit(1, poseAbove(GROUND, FACING.right))
    return body(field)
  })
}

/** Runs `run` with the same registrations `inMarkedField` makes, as a replay needs them. */
export function withTreeAndFakes<T>(run: () => T): T {
  const loaded = loadedRegistrySet()
  return withFreshRegistrySet(() => {
    copyRegistrationsOf(loaded, 'tech-tree')
    registerSlices([slice, FAKE_MILESTONE_ITEMS])
  }, run)
}

export function actsOf(state: AuthorityState): readonly FakeAct[] {
  return readSection(state, 'p1', ACTS_SECTION).acts
}

function researchThrough(planetIndex: number): CommandIntent {
  return { type: 'debug.tech-tree.unlockThrough', payload: { planetIndex } } as CommandIntent
}

function recordingSession(): MarkedField {
  const session = createScriptedSession()
  const commands: AuthorityCommand[] = []
  const submit = (tick: number, intent: CommandIntent) => {
    commands.push({ playerId: 'p1', tick, seq: commands.length + 1, ...intent } as AuthorityCommand)
    return session.submit(tick, intent)
  }
  return { ...session, submit, commands }
}

/**
 * The loaded set, to copy its `tech-tree` registrations beside the core and the fakes: a slice
 * spec cannot import another slice's definition, and the tree's section and debug grant are the
 * only way to research a Mark.
 */
function loadedRegistrySet(): RegistrySet {
  const loaded = swapRegistrySet(createRegistrySet())
  swapRegistrySet(loaded)
  return loaded
}

function copyRegistrationsOf(from: RegistrySet, sliceId: string): void {
  from.shelves.forEach((shelf, registry) =>
    shelf.registrations
      .filter((registration) => registration.sliceId === sliceId)
      .forEach((registration) => addToRegistry(registry, sliceId, registration.entry)),
  )
}

function vehicleItemOf(itemId: string): VehicleItem {
  return { id: itemId, iconId: 'icon-panel-slots', slots: POWER_UP_SLOTS, attach: null }
}

function techNodeOf(itemId: string): TechNode {
  return {
    id: `${itemId}-node`,
    iconId: 'icon-panel-slots',
    lane: 'mobility',
    name: itemId,
    unlockTier: 1,
    prereqs: [],
    unlocks: itemId,
    description: 'A fake for the milestone specs.',
    label: 'vertical',
    costKind: 'capability',
    marks: LADDERS[itemId],
  }
}

function dasherOf(): PowerUp {
  return {
    id: `${DASHER}.power-up`,
    itemId: DASHER,
    iconId: 'icon-panel-slots',
    name: DASHER,
    powerUpClass: 'charged',
    charges: DASHER_CHARGES,
    cooldownTicks: DASHER_COOLDOWN_TICKS,
    windupTicks: DASHER_WINDUP_TICKS,
    channelTicks: 0,
    isToggle: false,
    energyDrawBpPerSecond: 0,
    activate: noteActUnlessFacingDown,
  }
}

function switchOf(): PowerUp {
  return {
    ...dasherOf(),
    id: `${SWITCH}.power-up`,
    itemId: SWITCH,
    name: SWITCH,
    powerUpClass: 'passive',
    charges: 0,
    cooldownTicks: 0,
    windupTicks: 0,
    isToggle: true,
  }
}

function noteActUnlessFacingDown(state: AuthorityState, use: PowerUpUse): PowerUpOutcome {
  const vehicle = state.players[use.playerId].vehicle
  if (vehicle.pose?.facing === FACING.down) {
    return { kind: 'blocked', block: { ...FAKE_GATE, tx: use.origin.tx, ty: use.origin.ty - 1 } }
  }
  return { kind: 'acted', effect: { state: withActNoted(state, use), events: [] } }
}

function withActNoted(state: AuthorityState, use: PowerUpUse): AuthorityState {
  const verbs = VERBS[use.itemId as keyof typeof VERBS]
  const { itemId, tick, mark, magnitude } = use
  const act = { itemId, verb: verbs[use.milestone ?? 'plain'], tick, mark, magnitude }
  const { acts } = readSection(state, use.playerId, ACTS_SECTION)
  return withSection(state, use.playerId, ACTS_SECTION, { acts: [...acts, act] })
}

/** The dasher's running effects at `tick`: its boost or burn, and an air-dash on top. */
function dasherMotionOf(
  state: AuthorityState,
  playerId: string,
  tick: number,
): VehicleMotionEffect | null {
  const running = readSection(state, playerId, ACTS_SECTION).acts.filter(
    (act) => act.itemId === DASHER && tick < act.tick + EFFECT_TICKS,
  )
  if (running.length === 0) return null
  return running.some((act) => act.verb === VERBS[DASHER]['second-tap'])
    ? airDashOf(tick)
    : { driveBp: BOOST_DRIVE_BP }
}

function airDashOf(tick: number): VehicleMotionEffect {
  return {
    liftBp: AIR_DASH_ASK_BP,
    driveBp: AIR_DASH_ASK_BP + BOOST_DRIVE_BP,
    burst: { dirX: 1, dirY: 0, speedMmPerS: 20_000, untilTick: tick + 1 },
  }
}
