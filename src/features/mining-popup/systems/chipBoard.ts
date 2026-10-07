/**
 * The resource chips (#172 §1): one chip per ore type; a pickup within 1.2 s of the last one merges
 * into it, extending its life up to 3 s from its first pickup; at most 3 chips at once, the oldest
 * giving way to a new one. From the 4th chip of a type on a planet only the icon and count show.
 * Pure: time is the authority tick of the pickup, the face and direction come in with it.
 */
import {
  CHIP_FADE_TICKS,
  CHIP_LIFE_CAP_TICKS,
  CHIP_MERGE_TICKS,
  CHIP_RISE_TICKS,
  MOST_CHIPS_SHOWN,
  NAMED_CHIPS_PER_PLANET,
} from './popupTiming'
import type { OreFace } from './oreFace'
import type { LocalDirection } from './render/chipPlacement'

export interface OrePickup {
  face: OreFace
  amount: number
  tick: number
  planetIndex: number
  /** Where a chip spawned by this pickup sits; a merge keeps the chip where it is. */
  away: LocalDirection
}

export interface ResourceChip {
  /** Unique on the board, so a new chip of a type is a new element. */
  serial: number
  face: OreFace
  count: number
  firstTick: number
  lastTick: number
  endsTick: number
  /** 0 nearest the hull; a chip keeps its slot for its life. */
  slot: number
  isNamed: boolean
  away: LocalDirection
}

export type ChipPhase = 'rising' | 'fading'

export interface ChipBoard {
  /** Oldest first. */
  chips: readonly ResourceChip[]
  nextSerial: number
  planetIndex: number | null
  chipsSpawnedByOre: Readonly<Record<string, number>>
}

export const EMPTY_CHIP_BOARD: ChipBoard = {
  chips: [],
  nextSerial: 0,
  planetIndex: null,
  chipsSpawnedByOre: {},
}

const BASE_LIFE_TICKS = CHIP_RISE_TICKS + CHIP_FADE_TICKS

export function addPickupToChips(board: ChipBoard, pickup: OrePickup): ChipBoard {
  const current = withoutEndedChips(onPlanet(board, pickup.planetIndex), pickup.tick)
  const merging = mergingChipOf(current, pickup)
  return merging === null
    ? withSpawnedChip(current, pickup)
    : withMergedChip(current, merging, pickup)
}

/** The chips still on screen at `tick`, oldest first. */
export function chipsShownAt(board: ChipBoard, tick: number): readonly ResourceChip[] {
  return board.chips.filter((chip) => tick < chip.endsTick)
}

export function chipPhaseAt(chip: ResourceChip, tick: number): ChipPhase {
  return tick >= chip.endsTick - CHIP_FADE_TICKS ? 'fading' : 'rising'
}

export function withoutEndedChips(board: ChipBoard, tick: number): ChipBoard {
  const chips = chipsShownAt(board, tick)
  return chips.length === board.chips.length ? board : { ...board, chips }
}

/** A new planet starts the naming count again. */
function onPlanet(board: ChipBoard, planetIndex: number): ChipBoard {
  if (board.planetIndex === planetIndex) return board
  return { ...board, planetIndex, chipsSpawnedByOre: {} }
}

function mergingChipOf(board: ChipBoard, pickup: OrePickup): ResourceChip | null {
  const chip = board.chips.find((shown) => shown.face.oreId === pickup.face.oreId)
  if (chip === undefined) return null
  const isWithinMergeWindow = pickup.tick - chip.lastTick <= CHIP_MERGE_TICKS
  return isWithinMergeWindow && pickup.tick < lifeCapOf(chip) ? chip : null
}

function withMergedChip(board: ChipBoard, chip: ResourceChip, pickup: OrePickup): ChipBoard {
  const merged: ResourceChip = {
    ...chip,
    count: chip.count + pickup.amount,
    lastTick: pickup.tick,
    endsTick: Math.min(lifeCapOf(chip), Math.max(chip.endsTick, pickup.tick + BASE_LIFE_TICKS)),
  }
  return { ...board, chips: board.chips.map((shown) => (shown === chip ? merged : shown)) }
}

function withSpawnedChip(board: ChipBoard, pickup: OrePickup): ChipBoard {
  const kept = withRoomForOneMore(board.chips, pickup.face.oreId)
  const spawned = spawnedChipOf(board, kept, pickup)
  return {
    ...board,
    chips: [...kept, spawned],
    nextSerial: board.nextSerial + 1,
    chipsSpawnedByOre: { ...board.chipsSpawnedByOre, [pickup.face.oreId]: spawnsOf(board, pickup) },
  }
}

/** One chip per type: drops the type's older chip, then the oldest chips until a new one fits. */
function withRoomForOneMore(
  chips: readonly ResourceChip[],
  oreId: string,
): readonly ResourceChip[] {
  const others = chips.filter((chip) => chip.face.oreId !== oreId)
  return others.slice(Math.max(0, others.length - (MOST_CHIPS_SHOWN - 1)))
}

function spawnedChipOf(
  board: ChipBoard,
  kept: readonly ResourceChip[],
  pickup: OrePickup,
): ResourceChip {
  return {
    serial: board.nextSerial,
    face: pickup.face,
    count: pickup.amount,
    firstTick: pickup.tick,
    lastTick: pickup.tick,
    endsTick: pickup.tick + BASE_LIFE_TICKS,
    slot: freeSlotOf(kept),
    isNamed: spawnsOf(board, pickup) <= NAMED_CHIPS_PER_PLANET,
    away: pickup.away,
  }
}

function spawnsOf(board: ChipBoard, pickup: OrePickup): number {
  return (board.chipsSpawnedByOre[pickup.face.oreId] ?? 0) + 1
}

function freeSlotOf(chips: readonly ResourceChip[]): number {
  const taken = new Set(chips.map((chip) => chip.slot))
  let slot = 0
  while (taken.has(slot)) slot += 1
  return slot
}

function lifeCapOf(chip: ResourceChip): number {
  return chip.firstTick + CHIP_LIFE_CAP_TICKS
}
