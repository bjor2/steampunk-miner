import { describe, expect, it } from 'vitest'
import { EMPTY_HINT_BOARD, type HintBoard } from '../hints/hintBoard'
import { EMPTY_TRANSMISSION_BOARD } from '../hints/transmissionBoard'
import { ACTION_MAP, bindingsWithOverrides, defaultBindings } from '../input/actionMap'
import { isQuickServiceHighlighted, selectPlaqueModel, type PlaqueSources } from './plaqueModel'

const boardShowing = (id: string, rescueCost: HintBoard['queued'][0]['rescueCost'] = null) => ({
  ...EMPTY_HINT_BOARD,
  shown: { id, rescueCost, shownTick: 0 },
})

const sources = (patch: Partial<PlaqueSources> = {}): PlaqueSources => ({
  hintBoard: EMPTY_HINT_BOARD,
  transmissionBoard: EMPTY_TRANSMISSION_BOARD,
  bindings: defaultBindings(ACTION_MAP),
  isShowingHints: true,
  isShowingTransmissions: true,
  ...patch,
})

describe('plaque model', () => {
  it('prints the keys bound now in the hint text', () => {
    const { hint } = selectPlaqueModel(sources({ hintBoard: boardShowing('hint_move') }))
    expect(hint?.lines).toEqual([
      'Drive left and right with A and D.',
      'Hold Space to fire the thruster and climb.',
    ])
  })

  it('follows a rebinding at once', () => {
    const bindings = bindingsWithOverrides(ACTION_MAP, { lift: { keyboard: ['KeyJ'] } }).bindings
    const { hint } = selectPlaqueModel(sources({ hintBoard: boardShowing('hint_move'), bindings }))
    expect(hint?.lines[1]).toBe('Hold J to fire the thruster and climb.')
  })

  it('says what a tow cost on the energy hint after a rescue', () => {
    const hintBoard = boardShowing('hint_energy', { fee: '12.5', cargoLostValue: '40' })
    const { hint } = selectPlaqueModel(sources({ hintBoard }))
    expect(hint?.lines[0]).toBe(
      'The tow brought you home. You lost cargo worth 40 and paid a 12.5 fee, nothing more.',
    )
  })

  it('shows no hint with the hints switched off, and still the transmission', () => {
    const model = selectPlaqueModel(
      sources({
        hintBoard: boardShowing('hint_move'),
        transmissionBoard: { queued: [], shown: 'transmission_opening' },
        isShowingHints: false,
      }),
    )
    expect(model.hint).toBeNull()
    expect(model.transmission?.id).toBe('transmission_opening')
  })

  it('highlights Sell, repair and recharge while the dock hint is up', () => {
    expect(isQuickServiceHighlighted(sources({ hintBoard: boardShowing('hint_dock') }))).toBe(true)
    expect(isQuickServiceHighlighted(sources({ hintBoard: boardShowing('hint_cargo') }))).toBe(
      false,
    )
  })
})
