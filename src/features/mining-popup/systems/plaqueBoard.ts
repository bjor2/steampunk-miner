/**
 * The tier-0 "NEW MATERIAL" plaque (#172 §2): 0.25 s in, 2.5 s hold, 0.6 s fade, never clicked.
 * A discovery while one is up joins it, listed under the first, and keeps it up longer, but never
 * past 6 s from its first appearance; there is never a queue. Tiers 1 and 2 follow #146 (Game
 * Director on #178). Pure: time is the authority tick of the discovery.
 */
import type { OreFace } from './oreFace'
import {
  PLAQUE_FADE_TICKS,
  PLAQUE_HOLD_TICKS,
  PLAQUE_IN_TICKS,
  PLAQUE_LIFE_CAP_TICKS,
} from './popupTiming'

/** A first-mined ore type, with its per-unit price here already formatted once. */
export interface NewMaterial {
  face: OreFace
  /** "sells for ~X each": the gross Sell-bay unit price on this planet, `formatAmount`ed. */
  unitPriceText: string
}

export interface MaterialPlaque {
  serial: number
  /** First discovery first. */
  materials: readonly NewMaterial[]
  shownTick: number
  endsTick: number
}

export type PlaquePhase = 'in' | 'hold' | 'fade'

export interface PlaqueBoard {
  plaque: MaterialPlaque | null
  nextSerial: number
}

export const EMPTY_PLAQUE_BOARD: PlaqueBoard = { plaque: null, nextSerial: 0 }

const PLAQUE_LIFE_TICKS = PLAQUE_IN_TICKS + PLAQUE_HOLD_TICKS + PLAQUE_FADE_TICKS

export function addDiscoveryToPlaque(
  board: PlaqueBoard,
  material: NewMaterial,
  tick: number,
): PlaqueBoard {
  const shown = plaqueShownAt(board, tick)
  if (shown === null) return withNewPlaque(board, material, tick)
  return { ...board, plaque: joinedPlaqueOf(shown, material, tick) }
}

/** The plaque on screen at `tick`, or null. */
export function plaqueShownAt(board: PlaqueBoard, tick: number): MaterialPlaque | null {
  const { plaque } = board
  return plaque !== null && tick < plaque.endsTick ? plaque : null
}

export function plaquePhaseAt(plaque: MaterialPlaque, tick: number): PlaquePhase {
  if (tick < plaque.shownTick + PLAQUE_IN_TICKS) return 'in'
  return tick >= plaque.endsTick - PLAQUE_FADE_TICKS ? 'fade' : 'hold'
}

function withNewPlaque(board: PlaqueBoard, material: NewMaterial, tick: number): PlaqueBoard {
  return {
    plaque: {
      serial: board.nextSerial,
      materials: [material],
      shownTick: tick,
      endsTick: tick + PLAQUE_LIFE_TICKS,
    },
    nextSerial: board.nextSerial + 1,
  }
}

/** Held for a full hold and fade from the join, capped at 6 s from the first appearance. */
function joinedPlaqueOf(
  plaque: MaterialPlaque,
  material: NewMaterial,
  tick: number,
): MaterialPlaque {
  if (plaque.materials.some((shown) => shown.face.oreId === material.face.oreId)) return plaque
  const heldTo = Math.max(plaque.endsTick, tick + PLAQUE_HOLD_TICKS + PLAQUE_FADE_TICKS)
  return {
    ...plaque,
    materials: [...plaque.materials, material],
    endsTick: Math.min(plaque.shownTick + PLAQUE_LIFE_CAP_TICKS, heldTo),
  }
}
