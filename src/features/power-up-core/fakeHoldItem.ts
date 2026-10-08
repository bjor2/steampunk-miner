/**
 * A fake item used by holding its slot, for the slot release specs (ticket 332): a charged clamp
 * standing in for the lode clamp (#285). Its act starts a 90-tick hold kept in the fixture's
 * section; letting go of the slot (`release`) or the hold running its length ends it, notes the
 * tick it ended, and restarts the item's cooldown from that tick, as the clamp's brace end does.
 * Every call of `release` is noted with its tick, so a spec sees the hook ran once. Spec-only: no
 * register.ts imports this.
 */
import { withRegistrations } from '../../registries/registrar'
import type { SliceDefinition } from '../../registries/sliceDefinition'
import type { AuthorityState } from '../../systems/authority/authorityState'
import type { AuthorityCommand, CommandIntent } from '../../systems/authority/authorityCommand'
import { chainEffects, unchanged, type RuleEffect } from '../../systems/authority/commandRule'
import { setVehicleLoadoutCommand } from '../../systems/authority/loadoutCommands'
import {
  createScriptedSession,
  GROUND,
  poseAbove,
  type ScriptedSession,
} from '../../systems/authority/scriptedSession'
import type { ClockStep } from '../../systems/registries/clockSteps'
import { readSection, withSection, type SaveSection } from '../../systems/registries/saveSections'
import type { VehicleItem } from '../../systems/registries/vehicleLoadout'
import { FACING } from '../../systems/vehicle/vehiclePose'
import { FAKE, FAKE_ITEMS } from './fakeItems'
import { slice } from './register'
import type {
  PowerUp,
  PowerUpOutcome,
  PowerUpUse,
  SlotHold,
  SlotRelease,
} from './systems/powerUpKind'
import { POWER_UP_SLOTS } from './systems/powerUpSlots'
import { startCooldownAt } from './systems/slotRelease'

const SLICE_ID = 'fake-holds'

export const CLAMP = `${SLICE_ID}.clamp`

export const CLAMP_WINDUP_TICKS = 6
export const CLAMP_HOLD_TICKS = 90
/** The lode clamp's floor (the GD guard on #285: at least 600, counted from the hold's end). */
export const CLAMP_COOLDOWN_TICKS = 600

export interface ClampNotes {
  hold: SlotHold | null
  /** The tick the last hold ended, by release or by running its length; null before any. */
  endedAtTick: number | null
  /** The tick of every call of the clamp's `release`. */
  releaseTicks: readonly number[]
}

const NO_NOTES: ClampNotes = { hold: null, endedAtTick: null, releaseTicks: [] }

const NOTES_SECTION: SaveSection<ClampNotes> = {
  id: SLICE_ID,
  version: 1,
  scope: 'player',
  initial: NO_NOTES,
  problems: () => [],
  toPortable: (value) => value,
  ofPortable: (body) => body as ClampNotes,
}

const END_HOLDS_STEP: ClockStep = {
  id: `${SLICE_ID}.end-holds`,
  nextTick: nextHoldEndOf,
  run: endHoldsDueAt,
}

export const FAKE_HOLD_ITEMS: SliceDefinition = {
  id: SLICE_ID,
  register(r) {
    r.content('vehicle-item', [clampItemOf()])
    r.content('power-up', [clampOf()])
    r.saveSection(NOTES_SECTION)
    r.clockStep(END_HOLDS_STEP)
  },
}

/** A scripted session that keeps the commands it was given, so a spec can replay them. */
export interface HoldField extends ScriptedSession {
  commands: readonly AuthorityCommand[]
}

/**
 * Runs `body` with the core slice, the core's fakes and the clamp registered, on a planet-1
 * session with the clamp in slot 1, the fake charged item (no `release`) in slot 2 and the
 * vehicle at rest on open ground from tick 1.
 */
export function inHoldField<T>(body: (field: HoldField) => T): T {
  return withHoldItems(() => {
    const field = recordingSession()
    field.submit(0, setVehicleLoadoutCommand({ 'powerup.1': CLAMP, 'powerup.2': FAKE.charged }))
    field.submit(1, poseAbove(GROUND, FACING.right))
    return body(field)
  })
}

/** Runs `run` with the registrations `inHoldField` makes, as a replay needs them. */
export function withHoldItems<T>(run: () => T): T {
  return withRegistrations([slice, FAKE_ITEMS, FAKE_HOLD_ITEMS], run)
}

export function clampNotesOf(state: AuthorityState, playerId = 'p1'): ClampNotes {
  return readSection(state, playerId, NOTES_SECTION)
}

function clampItemOf(): VehicleItem {
  return { id: CLAMP, iconId: 'icon-panel-slots', slots: [...POWER_UP_SLOTS], attach: null }
}

function clampOf(): PowerUp {
  return {
    id: `${CLAMP}.power-up`,
    itemId: CLAMP,
    iconId: 'icon-panel-slots',
    name: CLAMP,
    powerUpClass: 'charged',
    charges: 2,
    cooldownTicks: CLAMP_COOLDOWN_TICKS,
    windupTicks: CLAMP_WINDUP_TICKS,
    channelTicks: 0,
    isToggle: false,
    energyDrawBpPerSecond: 0,
    activate: startHold,
    holdOf: (state, playerId) => clampNotesOf(state, playerId).hold,
    release: releaseHold,
  }
}

function startHold(state: AuthorityState, use: PowerUpUse): PowerUpOutcome {
  const hold = { startTick: use.tick, finishTick: use.tick + CLAMP_HOLD_TICKS }
  const notes = { ...clampNotesOf(state, use.playerId), hold }
  return { kind: 'acted', effect: unchanged(withNotes(state, use.playerId, notes)) }
}

function releaseHold(state: AuthorityState, { playerId, tick }: SlotRelease): PowerUpOutcome {
  const notes = clampNotesOf(state, playerId)
  const noted = withNotes(state, playerId, {
    ...notes,
    releaseTicks: [...notes.releaseTicks, tick],
  })
  return { kind: 'acted', effect: unchanged(endHoldAt(noted, playerId, tick)) }
}

/** The hold ends: its tick is noted and the cooldown counts from it. */
function endHoldAt(state: AuthorityState, playerId: string, tick: number): AuthorityState {
  const ended = { ...clampNotesOf(state, playerId), hold: null, endedAtTick: tick }
  return startCooldownAt(withNotes(state, playerId, ended), playerId, CLAMP, tick)
}

function nextHoldEndOf(state: AuthorityState): number | null {
  const ticks = Object.keys(state.players).flatMap((playerId) => {
    const { hold } = clampNotesOf(state, playerId)
    return hold === null ? [] : [hold.finishTick]
  })
  return ticks.length === 0 ? null : Math.min(...ticks)
}

function endHoldsDueAt(state: AuthorityState, tick: number): RuleEffect {
  return chainEffects(
    state,
    Object.keys(state.players)
      .sort()
      .map((playerId) => (current: AuthorityState) => endHoldIfDue(current, playerId, tick)),
  )
}

function endHoldIfDue(state: AuthorityState, playerId: string, tick: number): RuleEffect {
  const { hold } = clampNotesOf(state, playerId)
  if (hold === null || tick < hold.finishTick) return unchanged(state)
  return unchanged(endHoldAt(state, playerId, hold.finishTick))
}

function recordingSession(): HoldField {
  const session = createScriptedSession()
  const commands: AuthorityCommand[] = []
  const submit = (tick: number, intent: CommandIntent) => {
    commands.push({ playerId: 'p1', tick, seq: commands.length + 1, ...intent } as AuthorityCommand)
    return session.submit(tick, intent)
  }
  return { ...session, submit, commands }
}

function withNotes(state: AuthorityState, playerId: string, notes: ClampNotes): AuthorityState {
  return withSection(state, playerId, NOTES_SECTION, notes)
}
