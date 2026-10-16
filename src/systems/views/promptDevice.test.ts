/**
 * Prompts follow the input device (P1-4 of #470): the kernel's prompt sources read with a touch
 * fixture name no key, and the copy rules of #470 (P&C, approved by the GD) hold. The dynamite rack
 * panel's touch case lives beside it in its slice (`rackPanel.test.ts`).
 */
import { describe, expect, it } from 'vitest'
import { withRegistrations } from '../../registries/registrar'
import { AUTO_ON, searSlice } from '../authority/bore/boreAutoFixtures'
import { setChargesIntent } from '../authority/charges/chargeFixtures'
import { createScriptedSession } from '../authority/scriptedSession'
import { EMPTY_HINT_BOARD } from '../hints/hintBoard'
import { HINT_TABLE } from '../hints/hintTable'
import { EMPTY_TRANSMISSION_BOARD } from '../hints/transmissionBoard'
import { ACTION_IDS, ACTION_MAP } from '../input/actionMap'
import { keyLabelOf } from '../input/keyCodes'
import { DEFAULT_PREFERENCES } from '../input/preferences'
import { promptLabelOf, SHIPPED_TOUCH_PROMPTS, type PromptSource } from '../input/promptLabel'
import { KEYBOARD_PROMPTS, TOUCH_PROMPTS } from '../input/promptFixtures'
import { setGunLevelCommand } from '../vehicle/vehicleCommands'
import { selectHudModel, type HudModel } from './hudModel'
import { selectPlaqueModel } from './plaqueModel'
import { selectSettingsModel } from './settingsModel'

/** The copy rule of #470: card and prompt lines never say click, hover or mouse. */
const BANNED_WORDS = /click|hover|mouse|right-click/i

/** Device words a line may print only through `{inputVerb}`/`{inputNoun}` or `{actionId}`. */
const DEVICE_WORDS = /\b(press|tap|click|key|button)\b/i

const PLACEHOLDERS = /\{[^}]*\}/g

/**
 * Every key label the shipped keyboard map prints. Digit and symbol labels are left out: counts
 * ("2/4") and punctuation share them, and no key prompt ever printed one without its brackets.
 */
const KEY_NAMES = [
  ...new Set(ACTION_MAP.actions.flatMap((action) => action.keyboard.map(keyLabelOf))),
].filter((label) => /[A-Za-z]/.test(label))

function keyNamesIn(text: string): string[] {
  return KEY_NAMES.filter((name) => new RegExp(`(^|[^A-Za-z])${name}([^A-Za-z]|$)`).test(text))
}

function hudOn(prompts: PromptSource): HudModel {
  const session = createScriptedSession()
  session.submit(0, setGunLevelCommand(10))
  session.submit(1, setChargesIntent(2, 1))
  return selectHudModel({
    state: session.state(),
    playerId: 'p1',
    depthTiles: 0,
    prompts,
    isAwaitingPlay: true,
  })
}

function hudPromptTexts(prompts: PromptSource): string[] {
  const hud = hudOn(prompts)
  return [
    hud.dockPrompt.text,
    hud.cachePrompt.text,
    hud.readyPrompt.text,
    hud.guns?.text ?? '',
    hud.charges?.text ?? '',
  ]
}

function boreAutoText(prompts: PromptSource): string {
  return withRegistrations([searSlice()], () => {
    const session = createScriptedSession()
    session.submit(1, AUTO_ON)
    const hud = selectHudModel({ state: session.state(), playerId: 'p1', depthTiles: 0, prompts })
    return hud.boreAuto?.text ?? ''
  })
}

const RESCUE_COST = { fee: '12.5', cargoLostValue: '40' }

function plaqueTexts(prompts: PromptSource): string[] {
  const hints = HINT_TABLE.hints.flatMap((hint) => [
    ...plaqueLines(prompts, hint.id, null),
    ...plaqueLines(prompts, hint.id, RESCUE_COST),
  ])
  const transmissions = HINT_TABLE.transmissions.map((entry) => entry.id)
  return [...hints, ...transmissions.flatMap((id) => transmissionLines(prompts, id))]
}

function plaqueLines(
  prompts: PromptSource,
  id: string,
  rescueCost: typeof RESCUE_COST | null,
): string[] {
  const model = selectPlaqueModel({
    hintBoard: { ...EMPTY_HINT_BOARD, shown: { id, rescueCost, shownTick: 0 } },
    transmissionBoard: EMPTY_TRANSMISSION_BOARD,
    prompts,
    isShowingHints: true,
    isShowingTransmissions: true,
  })
  return model.hint?.lines ?? []
}

function transmissionLines(prompts: PromptSource, id: string): string[] {
  const model = selectPlaqueModel({
    hintBoard: EMPTY_HINT_BOARD,
    transmissionBoard: { queued: [], shown: id },
    prompts,
    isShowingHints: true,
    isShowingTransmissions: true,
  })
  return model.transmission?.lines ?? []
}

function settingsTexts(prompts: PromptSource): string[] {
  const model = selectSettingsModel({
    ...prompts,
    prefs: DEFAULT_PREFERENCES,
    bindingProblems: [],
    rebindingActionId: null,
  })
  return model.bindings.flatMap((row) => [row.keyText, row.padText])
}

function promptTextsOn(prompts: PromptSource): string[] {
  return [
    ...hudPromptTexts(prompts),
    boreAutoText(prompts),
    ...plaqueTexts(prompts),
    ...settingsTexts(prompts),
    ...ACTION_IDS.map((id) => promptLabelOf(id, prompts, prompts.inputDevice)),
  ]
}

/** The lines as written, before any placeholder is filled. */
function writtenPromptLines(): string[] {
  return [
    ...HINT_TABLE.hints.flatMap((hint) => [...hint.lines, ...(hint.afterRescueLines ?? [])]),
    ...HINT_TABLE.transmissions.flatMap((transmission) => transmission.lines),
  ]
}

describe('prompts on touch (P1-4 of #470)', () => {
  it('reads the key names with the keyboard fixture, so the detector sees them', () => {
    expect(hudPromptTexts(KEYBOARD_PROMPTS).flatMap(keyNamesIn)).toEqual(
      expect.arrayContaining(['Space', 'G', 'B']),
    )
    expect(keyNamesIn(boreAutoText(KEYBOARD_PROMPTS))).toEqual(['T'])
  })

  it('names no key in any prompt while the touch controls show', () => {
    const named = promptTextsOn(TOUCH_PROMPTS).filter((text) => keyNamesIn(text).length > 0)
    expect(named).toEqual([])
  })

  it('names the touch control in the HUD prompts', () => {
    const hud = hudOn(TOUCH_PROMPTS)
    expect(hud.dockPrompt.text).toBe('Dock button: Dock at the Sell bay')
    expect(hud.guns?.text).toBe('Auto (Guns button)')
    expect(hud.charges?.text).toBe('2/4 (Charge button)')
    expect(hud.readyPrompt.text).toBe('Scenario ready — tap any control')
    expect(boreAutoText(TOUCH_PROMPTS)).toMatch(/\(lamp\)$/)
  })

  it('keeps the keyboard prompts as they read before', () => {
    const hud = hudOn(KEYBOARD_PROMPTS)
    expect(hud.dockPrompt.text).toBe('Space: Dock at the Sell bay')
    expect(hud.readyPrompt.text).toBe('Scenario ready — press any key')
  })

  it('shows the touch control in the settings key column and leaves the pad column blank', () => {
    const rows = selectSettingsModel({
      ...TOUCH_PROMPTS,
      prefs: DEFAULT_PREFERENCES,
      bindingProblems: [],
      rebindingActionId: null,
    }).bindings
    expect(rows.find((row) => row.actionId === 'interact')).toMatchObject({
      keyText: 'Dock button',
      padText: '',
    })
  })
})

describe('prompt copy rules (#470, Progression & Content)', () => {
  it('never says click, hover or mouse in a touch prompt', () => {
    expect(promptTextsOn(TOUCH_PROMPTS).filter((text) => BANNED_WORDS.test(text))).toEqual([])
  })

  it('never says click, hover or mouse in a written prompt line or touch word', () => {
    const words = [
      ...writtenPromptLines(),
      ...Object.values(SHIPPED_TOUCH_PROMPTS.labels),
      ...Object.values(SHIPPED_TOUCH_PROMPTS.deviceWords).flatMap((words) => Object.values(words)),
    ]
    expect(words.filter((text) => BANNED_WORDS.test(text))).toEqual([])
  })

  it('writes device hints only through placeholders', () => {
    const literal = writtenPromptLines().filter((line) =>
      DEVICE_WORDS.test(line.replace(PLACEHOLDERS, '')),
    )
    expect(literal).toEqual([])
  })
})
