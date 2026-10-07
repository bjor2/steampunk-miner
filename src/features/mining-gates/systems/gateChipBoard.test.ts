import { describe, expect, it } from 'vitest'
import type { DomainEvent } from '../../../systems/authority/domainEvent'
import { chipShownAt, CHIP_SHOW_TICKS, EMPTY_GATE_CHIP_BOARD } from './gateChipBoard'
import { boardAfterEvents, hasClearedGate } from './gateHintFeed'

// The HUD hint chip (ticket 238; #142: shown once per cell per dive), fed by the authority's events.

function stopAt(tx: number, tick: number, playerId = 'p1'): DomainEvent {
  return {
    type: 'DrillGated',
    tx,
    ty: -40,
    oreId: 'crystal_t25',
    family: 'crystal',
    tier: 25,
    gateKind: 'rig',
    outcome: 'refused',
    required: 'rig.resonance',
    have: 'none',
    playerId,
    tick,
    seq: tick,
  }
}

function dockAt(tick: number): DomainEvent {
  return {
    type: 'DockEntered',
    bay: 'sell',
    cargoUnits: 0,
    energy: 100,
    hull: '100',
    playerId: 'p1',
    tick,
    seq: tick,
  }
}

const afterEvents = (events: DomainEvent[], board = EMPTY_GATE_CHIP_BOARD) =>
  boardAfterEvents(board, events, 'p1')

describe('gate hint chip', () => {
  it("shows a gated cell's ledger line with the missing extractor's icon on the first stop", () => {
    const board = afterEvents([stopAt(3, 100)])
    expect(chipShownAt(board, 100)).toMatchObject({
      line: 'Ledger: Resonance Fork required.',
      iconId: 'item-rig-resonance',
      tx: 3,
      shownAtTick: 100,
    })
  })

  it('shows nothing for a second stop at the same cell in the same dive', () => {
    const shown = afterEvents([stopAt(3, 100)])
    const again = afterEvents([stopAt(3, 100 + CHIP_SHOW_TICKS * 2)], shown)
    expect(chipShownAt(again, 100 + CHIP_SHOW_TICKS * 2)).toBeNull()
  })

  it('shows another cell at once, in place of the chip showing', () => {
    const board = afterEvents([stopAt(3, 100), stopAt(4, 110)])
    expect(chipShownAt(board, 110)?.tx).toBe(4)
  })

  it('shows the same cell again in the next dive, after the dock', () => {
    const board = afterEvents([stopAt(3, 100), dockAt(500), stopAt(3, 900)])
    expect(chipShownAt(board, 900)?.tx).toBe(3)
  })

  it('clears the chip once it has held its show ticks', () => {
    const board = afterEvents([stopAt(3, 100)])
    expect(chipShownAt(board, 100 + CHIP_SHOW_TICKS - 1)).not.toBeNull()
    expect(chipShownAt(board, 100 + CHIP_SHOW_TICKS)).toBeNull()
  })

  it("never shows a teammate's stop", () => {
    expect(chipShownAt(afterEvents([stopAt(3, 100, 'p2')]), 100)).toBeNull()
  })

  it("hears a freed cell of the local player's only", () => {
    const cleared = (playerId: string): DomainEvent => ({
      type: 'mining-gates.GateCleared',
      tx: 3,
      ty: -40,
      oreId: 'crystal_t25',
      tier: 25,
      gateKind: 'rig',
      method: 'rig',
      units: 1,
      value: '10',
      playerId,
      tick: 5,
      seq: 5,
    })
    expect(hasClearedGate([cleared('p1')], 'p1')).toBe(true)
    expect(hasClearedGate([cleared('p2')], 'p1')).toBe(false)
  })
})
