import { describe, expect, it } from 'vitest'
import { debugActionsBySlice } from '../debug/debugActionRegistry'
import type { SliceEventProjections } from '../logging/registries/eventProjections'
import { unchanged } from '../systems/authority/commandRule'
import { COMMAND_RULE_REGISTRY, type SliceCommandRules } from '../systems/registries/commandRules'
import { contentOf } from '../systems/registries/content'
import { GATE_CHECK_REGISTRY, type GateCheck } from '../systems/registries/gateChecks'
import type { OreLookProvider } from '../systems/registries/oreLook'
import { saveSectionsOf, type SaveSection } from '../systems/registries/saveSections'
import type { VehicleItem } from '../systems/registries/vehicleLoadout'
import {
  createRegistrySet,
  entriesOf,
  FeaturesNotLoadedError,
  RegistrationRefusedError,
  swapRegistrySet,
} from '../systems/registries/seal'
import { oreLookOfCell } from '../systems/render/oreLook'
import { hudPanelsOf } from '../ui/registries/hudPanels'
import { loadSlices, registrarFor, withRegistrations } from './registrar'
import type { SliceDefinition, SliceRegistrar } from './sliceDefinition'

function sliceOf(id: string, register: (r: SliceRegistrar) => void): SliceDefinition {
  return { id, register }
}

const refuseAll = (id: string): GateCheck => ({
  id,
  check: () => ({ outcome: 'refused', gateKind: id, required: 'rig', have: 'none' }),
})

function lookProvider(id: string): OreLookProvider {
  return { id, oreLookOfCell }
}

function section(id: string): SaveSection<number> {
  return {
    id,
    version: 1,
    scope: 'player',
    initial: 0,
    problems: () => [],
    toPortable: (value) => value,
    ofPortable: (body) => body as number,
  }
}

function cradle(id: string): VehicleItem {
  return { id, iconId: 'icon-cradle', slots: [], attach: null, opensSlot: 'powerup.4' }
}

const contentIds = () => contentOf('vehicle-item').map(({ id }) => id)

/** Rules that change nothing, for the given command types: only their ids matter here. */
function rulesFor(...types: string[]): SliceCommandRules {
  const rule = { fields: {}, apply: unchanged }
  return Object.fromEntries(types.map((type) => [type, rule])) as SliceCommandRules
}

/** Runs `run` on a fresh, unsealed set, as a composition root sees it before loading. */
function onUnloadedSet<T>(run: () => T): T {
  const loaded = swapRegistrySet(createRegistrySet())
  try {
    return run()
  } finally {
    swapRegistrySet(loaded)
  }
}

describe('slice registrar', () => {
  it("reaches a registry through withRegistrations with only the given slices' entries", () => {
    const gates = sliceOf('mining-gates', (r) => r.gateCheck(refuseAll('mining-gates.rig')))
    const verdictIds = withRegistrations([gates], () =>
      entriesOf(GATE_CHECK_REGISTRY).map((check) => check.id),
    )
    expect(verdictIds).toEqual(['mining-gates.rig'])
  })

  it('puts the loaded registries back after withRegistrations', () => {
    const loaded = sliceOf('mining-gates', (r) => r.gateCheck(refuseAll('mining-gates.loaded')))
    const fake = sliceOf('mining-gates', (r) => r.gateCheck(refuseAll('mining-gates.fake')))
    const ids = onUnloadedSet(() => {
      loadSlices([loaded])
      withRegistrations([fake], () => undefined)
      return entriesOf(GATE_CHECK_REGISTRY).map((check) => check.id)
    })
    expect(ids).toEqual(['mining-gates.loaded'])
  })

  it('refuses an id without the slice prefix', () => {
    const stray = sliceOf('mining-gates', (r) => r.gateCheck(refuseAll('ores.rig')))
    expect(() => withRegistrations([stray], () => undefined)).toThrow(
      /registered "ores.rig" in "gateChecks"/,
    )
  })

  it('refuses an id that only shares the slice name as a prefix', () => {
    const stray = sliceOf('ores', (r) => r.gateCheck(refuseAll('ores-extra.rig')))
    expect(() => withRegistrations([stray], () => undefined)).toThrow(RegistrationRefusedError)
  })

  it('accepts a bare <category>.<name> catalogue id beside a prefixed one', () => {
    const cradles = sliceOf('power-up-core', (r) =>
      r.content('vehicle-item', [cradle('slot.powerup_4'), cradle('power-up-core.spare')]),
    )
    expect(withRegistrations([cradles], contentIds)).toEqual([
      'power-up-core.spare',
      'slot.powerup_4',
    ])
  })

  it('refuses a bare catalogue id a second slice registers, naming both slices', () => {
    const first = sliceOf('power-up-core', (r) =>
      r.content('vehicle-item', [cradle('slot.powerup_4')]),
    )
    const second = sliceOf('terrain-tools', (r) =>
      r.content('vehicle-item', [cradle('slot.powerup_4')]),
    )
    expect(() => withRegistrations([first, second], () => undefined)).toThrow(
      '"slot.powerup_4" is registered twice in "content": by slice "power-up-core" and by slice "terrain-tools"',
    )
  })

  it('refuses a bare content id with no category or a category outside the catalogue', () => {
    const flat = sliceOf('power-up-core', (r) =>
      r.content('vehicle-item', [cradle('remote_detonator')]),
    )
    const foreign = sliceOf('power-up-core', (r) =>
      r.content('vehicle-item', [cradle('mobility.cradle_3')]),
    )
    expect(() => withRegistrations([flat], () => undefined)).toThrow(
      /registered "remote_detonator" in "content", which has no category/,
    )
    expect(() => withRegistrations([foreign], () => undefined)).toThrow(
      /registered "mobility.cradle_3" in "content", which has category "mobility"/,
    )
  })

  it('keeps refusing a bare catalogue id outside content', () => {
    const stray = sliceOf('mining-gates', (r) => r.gateCheck(refuseAll('slot.powerup_4')))
    expect(() => withRegistrations([stray], () => undefined)).toThrow(
      /registered "slot.powerup_4" in "gateChecks"/,
    )
  })

  it('accepts a save section named by the bare slice id or a prefixed name', () => {
    const codex = sliceOf('codex', (r) => {
      r.saveSection(section('codex'))
      r.saveSection(section('codex.pages'))
    })
    const ids = withRegistrations([codex], () => saveSectionsOf('player').map(({ id }) => id))
    expect(ids).toEqual(['codex', 'codex.pages'])
  })

  it('accepts slice commands under the slice prefix and debug commands under debug.<slice>.', () => {
    const codex = sliceOf('codex', (r) =>
      r.commandRules(rulesFor('codex.read', 'debug.codex.fill')),
    )
    const types = withRegistrations([codex], () =>
      entriesOf(COMMAND_RULE_REGISTRY).map(({ id }) => id),
    )
    expect(types).toEqual(['codex.read', 'debug.codex.fill'])
  })

  it("refuses a command type in the kernel's or another slice's namespace", () => {
    for (const type of [
      'read',
      'debug.fill',
      'ores.read',
      'debug.ores.fill',
      'debug.codexx.fill',
    ]) {
      const stray = sliceOf('codex', (r) => r.commandRules(rulesFor(type)))
      expect(() => withRegistrations([stray], () => undefined), type).toThrow(
        RegistrationRefusedError,
      )
    }
  })

  it('refuses a projection or run event outside the slice namespace', () => {
    const projection = sliceOf('codex', (r) =>
      r.eventProjections({ 'ores.PageRead': () => null } as SliceEventProjections),
    )
    const runEvent = sliceOf('codex', (r) =>
      r.runEvents({ page_read: { group: 'progression', level: 'core', payload: {} } }),
    )
    expect(() => withRegistrations([projection], () => undefined)).toThrow(/"eventProjections"/)
    expect(() => withRegistrations([runEvent], () => undefined)).toThrow(/"runEvents"/)
  })

  it('refuses a second ore-look provider from another slice', () => {
    const first = sliceOf('ore-visuals', (r) => r.oreLook(lookProvider('ore-visuals.look')))
    const second = sliceOf('ores', (r) => r.oreLook(lookProvider('ores.look')))
    expect(() => withRegistrations([first, second], () => undefined)).toThrow(
      /"oreLook" takes one provider/,
    )
  })

  it('refuses a second item describer from another slice', () => {
    const describer = (id: string) => ({ id, describe: () => null })
    const first = sliceOf('descriptions', (r) => r.itemDescriber(describer('descriptions.card')))
    const second = sliceOf('codex', (r) => r.itemDescriber(describer('codex.card')))
    expect(() => withRegistrations([first, second], () => undefined)).toThrow(
      /"itemDescriber" takes one provider/,
    )
  })

  it('refuses two slices whose item description entries match the same ref', () => {
    const entry = (id: string) => ({
      id,
      matches: { kind: 'track' as const, id: 'drill_power' },
      flavour: 'A brass bit.',
      statLines: [],
    })
    const first = sliceOf('descriptions', (r) =>
      r.itemDescriptionEntries([entry('descriptions.drill')]),
    )
    const second = sliceOf('tech-tree', (r) => r.itemDescriptionEntries([entry('tech-tree.drill')]))
    expect(() => withRegistrations([first, second], () => undefined)).toThrow(
      /"descriptions.drill" \(slice "descriptions"\) and "tech-tree.drill" \(slice "tech-tree"\)/,
    )
  })

  it('refuses a second charge blast cue provider from another slice (#213)', () => {
    const kick = { shake: 1, flash: 1, thumpDelayTicks: 0 }
    const first = sliceOf('dynamite-visuals', (r) =>
      r.chargeBlastCue({ id: 'dynamite-visuals.cue', kickOf: () => kick }),
    )
    const second = sliceOf('dynamite', (r) =>
      r.chargeBlastCue({ id: 'dynamite.cue', kickOf: () => kick }),
    )
    expect(() => withRegistrations([first, second], () => undefined)).toThrow(
      /"chargeBlastCue" takes one provider/,
    )
  })

  it('refuses a registration after the seal', () => {
    const late = registrarFor('mining-gates')
    expect(() =>
      withRegistrations([], () => late.gateCheck(refuseAll('mining-gates.late'))),
    ).toThrow(/after the registries were sealed/)
  })

  it('files debug actions and HUD panels under their slice', () => {
    const describe = () => ({ ok: true as const })
    const panel = { id: 'example.gauge', slot: 'gauges' as const, Panel: () => null }
    const example = sliceOf('example', (r) => {
      r.debugActions({ describe })
      r.hudPanel(panel)
    })
    const filed = withRegistrations([example], () => ({
      actions: debugActionsBySlice(),
      gauges: hudPanelsOf('gauges'),
      banner: hudPanelsOf('banner'),
    }))
    expect(filed).toEqual({ actions: { example: { describe } }, gauges: [panel], banner: [] })
  })

  it('registers slices in id order whatever order they are given in', () => {
    const order: string[] = []
    const slices = ['zeta', 'alpha', 'mid'].map((id) => sliceOf(id, () => void order.push(id)))
    withRegistrations(slices, () => undefined)
    expect(order).toEqual(['alpha', 'mid', 'zeta'])
  })

  it('throws FeaturesNotLoadedError on a read before the slices are loaded, and answers after', () => {
    const gates = sliceOf('mining-gates', (r) => r.gateCheck(refuseAll('mining-gates.rig')))
    const outcome = onUnloadedSet(() => {
      expect(() => entriesOf(GATE_CHECK_REGISTRY)).toThrow(FeaturesNotLoadedError)
      expect(loadSlices([gates])).toEqual(['mining-gates'])
      return entriesOf(GATE_CHECK_REGISTRY).length
    })
    expect(outcome).toBe(1)
  })
})
