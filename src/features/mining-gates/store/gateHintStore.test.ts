import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { DomainEvent } from '../../../systems/authority/domainEvent'
import { listenForSoundCues, type SoundCueRequest } from '../../../store/soundCueRequests'
import { chipShownAt, CHIP_SHOW_TICKS } from '../systems/gateChipBoard'
import { resetGateHintStore, useGateHintStore } from './gateHintStore'

// The gate hints' store (ticket 238): an authority batch shows the chip and plays the gate's sound.

const shell: DomainEvent = {
  type: 'DrillGated',
  tx: 12,
  ty: -80,
  oreId: 'fossil_t21',
  family: 'fossil',
  tier: 21,
  gateKind: 'dynamite',
  outcome: 'refused',
  required: 'size:1',
  have: 'size:0',
  playerId: 'p1',
  tick: 300,
  seq: 9,
}

let heard: SoundCueRequest[] = []
let stopListening = () => {}

beforeEach(() => {
  resetGateHintStore()
  heard = []
  stopListening = listenForSoundCues((request) => heard.push(request))
})

afterEach(() => stopListening())

describe('gate hint store', () => {
  it("shows the shell's ledger line and knocks on it", () => {
    useGateHintStore.getState().observeGateEvents([shell], 'p1')
    const { board, tick } = useGateHintStore.getState()
    expect(chipShownAt(board, tick)?.line).toBe(
      'Ledger: dynamite size 1 required, the miner carries none.',
    )
    expect(heard.map((request) => request.cueId)).toEqual(['mining-gates.shell-knock'])
  })

  it('takes the chip off once the authority tick has passed its show time', () => {
    useGateHintStore.getState().observeGateEvents([shell], 'p1')
    useGateHintStore.getState().showAt(shell.tick + CHIP_SHOW_TICKS)
    expect(useGateHintStore.getState().board.chip).toBeNull()
  })

  it("stays silent and shows nothing for a teammate's stop", () => {
    useGateHintStore.getState().observeGateEvents([{ ...shell, playerId: 'p2' }], 'p1')
    expect(useGateHintStore.getState().board.chip).toBeNull()
    expect(heard).toEqual([])
  })
})
