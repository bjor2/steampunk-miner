# Slice template

How to start a feature slice. The rules are in [feature-slices.md](feature-slices.md) (#155); this page is the copyable shape. [`src/features/example/`](../../src/features/example/) is its committed, linted and tested copy: when this page and that folder disagree, the folder wins.

## Steps

1. Pick the id: kebab-case, one folder, `src/features/<slice>/`. The folder name is the id.
2. Copy `src/features/example/` and rename `example` everywhere: the folder, `register.ts`'s `id`, the index constant and the report.
3. Register what the slice adds in `register.ts`, one registrar call per entry. Every id starts with `<slice>.` (a save section may also be the bare `<slice>`); the registrar throws otherwise.
4. Put a test beside every rule. Kernel specs that need a fake of your slice use `withRegistrations` from `src/registries/registrar.ts` and never import the slice.
5. Run `npm run lint`: it fails any import into another slice that skips its `index.ts`, and any kernel import of a slice.

Nothing outside the folder changes. The loader finds `register.ts` by glob, the lint zones are generated from the folder list, and icons are found by file name.

## Files

```
src/features/<slice>/
  index.ts                public API: types, read selectors, constants, intents
  register.ts             export const slice: SliceDefinition; no side effects at import
  <slice>.economy.json    the slice's numbers (optional)
  systems/                pure rules: the authority lint set (exact maths, no clock or random)
  systems/render/         pure look maths: exempt from the exact-maths set only
  systems/<slice>Commands.ts  command, event and rejection augmentations and their rules (K1)
  logging.ts              projections of the slice's domain events and its run events (K1)
  store/                  optional zustand store fed by listenForDomainEvents
  ui/                     React + CSS Modules
  scene/                  R3F components
  icons/<icon-id>.svg     found by the kernel icon registry
  debug.ts                debug actions (optional); a state-changing one submits a debug.<slice>.* command
  *.test.ts               beside the code
```

## The example slice

```ts
// src/features/example/index.ts: public API only
export const EXAMPLE_SLICE_ID = 'example'
export type { ExampleReport } from './systems/describeExample'
export { describeExample } from './systems/describeExample'

// src/features/example/systems/describeExample.ts: pure, authority lint set
export interface ExampleReport { sliceId: 'example'; registers: readonly string[] }
export function describeExample(): ExampleReport {
  return { sliceId: 'example', registers: ['debugActions'] }
}

// src/features/example/debug.ts: read-only, so no command and no log line
import type { DebugAction } from '../../debug/debugActionRegistry'
import { describeExample } from './systems/describeExample'
export const exampleDebugActions: Readonly<Record<string, DebugAction>> = {
  describe: () => ({ ok: true, ...describeExample() }),
}

// src/features/example/register.ts: no side effects at import
import type { SliceDefinition } from '../../registries/sliceDefinition'
import { exampleDebugActions } from './debug'
export const slice: SliceDefinition = {
  id: 'example',
  register(r) {
    r.debugActions(exampleDebugActions)   // steampunkDebug.features.example.describe()
    // r.content('vehicle-item', [...]); r.gateCheck({ id: 'example.x', check }); r.saveSection({ id: 'example', version: 1, ... })
  },
}
```

## What the registrar takes

| Call | Registry | Notes |
| --- | --- | --- |
| `content(kind, entries)` | `src/systems/registries/content.ts` | Every entry has an `iconId`. The kind's owner declares it by module augmentation of `ContentKinds`. |
| `oreTypes(provider)` | `oreTypes.ts` | One provider across all slices (`ores`). |
| `gateCheck(check)` | `gateChecks.ts` | Verdict `cut`, `refused` or `lost` with `required` and `have`, or null for a cell with no gate. `query.blast` is null on the drill; the drill reports stops as `DrillGated` (feature-slices.md 3.6). |
| `blastEffect(effect)` | `blastEffects.ts` | Runs after the kernel's blast, in id order. |
| `clockStep(step)` | `clockSteps.ts` | Runs on the authority clock after the kernel's steps, in id order; `nextTick` stops a quiet clock (#217). |
| `inputReaction(reaction)` | `inputReactions.ts` | Answers a pressed action the kernel table leaves open (`use_slot_1` to `_5`); a null intent does nothing (#217). |
| `dockService(service)` | `dockServices.ts` | A free refill at the end of every paid recharge; the bill never changes (#217). |
| `generationHook(hook)` | `generationHooks.ts` | Integer-only folds; the hook's seed is `subSeedForHook(params, hook.id)`. Adding one bumps `GENERATOR_VERSION`. |
| `oreLook(provider)` | `oreLook.ts` | One provider (`ore-visuals`). |
| `saveSection(section)` | `saveSections.ts` | Its own `version`, matched exactly on restore. Read it with `readSection`, write it with `withSection`. A value at `initial` stays out of the state, so a section changes no digest until it is written. |
| `discovery(provider)` | `discovery.ts` | One provider (`codex`). |
| `loadoutAcceptance(rule)`, `attachUse(use)` | `vehicleLoadout.ts`, `vehicleAttach.ts` | Item slices only. |
| `hudPanel(panel)` | `src/ui/registries/hudPanels.ts` | The panel reads the slice's own store and takes no props. |
| `bayPanel(panel)` | `src/ui/registries/bayPanels.ts` | `header` (left of the bay's money) or `above` (a click-through layer over the bay screen); no props (feature-slices.md 3.21). |
| `moneyCounter(provider)` | `src/ui/registries/moneyCounter.ts` | One provider (`sell-burst`): the hook `useShownMoney(wallet)` returns the Money the bay header shows. |
| `worldPiece(piece)` | `src/scene/registries/worldPieces.ts` | An R3F piece drawn in its world layer (`platform`), no props (#175). |
| `vehicleStaging(provider)` | `src/systems/registries/vehicleStaging.ts` | One provider (`dock-buildings`): where the local car is drawn, the camera looks and input waits; presentation only (#170). |
| `dockFacility(facility)` | `src/systems/registries/dockFacilities.ts` | A dock building on a `facility` row of the schedule, which it claims (`scheduleRowId`): the row joins `builtFacilityRowIdsOn` from its `planetIndex` on, so travel logs its `FeatureUnlocked` once the row is shipped (#221). Delete the row from the deferred `dock-building` list in the same commit. |
| `artAssets(assets)` | `src/systems/registries/artAssets.ts` | Blender assets the slice ships: bare #52 ids (`prop-dynamite-charge`), kebab-case, starting with `<category>-`, never a kernel or another slice's id. They join `blenderAssetIds()`, which the manifest lint and `npm run art:export` read; `parts` joins the asset's valid part ids (#214). |
| `sceneLayer(layer)` | `src/scene/registries/sceneLayers.ts` | An R3F layer of the world scene with its draw budget, no props, drawn after the planted charges; it places pooled objects in `useFrame` and never writes state, camera or sound (#213). |
| `chargeBlastCue(provider)` | `src/systems/registries/chargeBlastCue.ts` | One provider (`dynamite-visuals`): a blast's shake, flash and thump delay from the detonation and the listener's distance; the kernel clamps it (#213). |
| `buildingAttachUse(use)` | `src/systems/registries/buildingAttach.ts` | A use of a shop building's attach point (#170). |
| `debugActions(actions)` | `src/debug/debugActionRegistry.ts` | Exposed as `steampunkDebug.features['<slice>']`. |
| `commandRules(rules)` | `src/systems/registries/commandRules.ts` | Keyed by command type: `<slice>.<name>`, or `debug.<slice>.<name>` for a debug command. `applyCommand` asks the kernel table first. |
| `authorityReaction(reaction)` | `src/systems/registries/authorityReactions.ts` | Folds each accepted command's and settled tick's events into the slice's section, per player, in id order; its events take the stamp of the events it heard. Read a `DrillDamageDealt` tile's ore with `oreTypeAtTile(before, event)` (feature-slices.md 3.21). |
| `eventProjections(projections)` | `src/logging/registries/eventProjections.ts` | Keyed by `<slice>.<Event>` domain event type; `() => null` for an event with no log line. |
| `runEvents(events)` | `src/logging/registries/runEvents.ts` | Keyed by `<slice>.<snake_case>` name, payload fully specified. |

Registries are read only after `loadFeatures()` has sealed them, so no slice module reads one at import time.

## A real slice also adds

- `<slice>.economy.json`
- `store/`, fed by `listenForDomainEvents` (`src/store/domainEventBroadcast.ts`), with a `reset<Slice>Store()` for `beforeEach`
- `ui/` with CSS Modules
- `icons/`
- commands, domain events and rejection reasons, as below
- a `scheduleRowId` on the content entry (or dock facility) that ships a row of `docs/scaling/horizontal/stats.json`, with the row deleted from the deferred list in `src/systems/registries/scheduleRows.ts` in the same commit

## Commands, events and debug commands (K1)

A slice never edits a kernel list. It augments the open interfaces and registers the rules, projections and run events. Kernel specs that need one write a fake the same way: `src/registries/sliceCommands.test.ts` is the worked example.

```ts
// src/features/<slice>/systems/<slice>Commands.ts: pure, authority lint set
import type { SliceCommandRules } from '../../../systems/registries/commandRules'
import { rejectionOf } from '../../../systems/authority/commandRule'

declare module '../../../systems/authority/authorityCommand' {
  interface CommandPayloads {
    'bell.ring': { strokes: number }
    'debug.bell.setStrokes': { strokes: number }
  }
}
declare module '../../../systems/authority/domainEvent' {
  interface DomainEventBodies { 'bell.Rung': { strokes: number } }
  interface RejectionReasons { 'bell.cracked': true }
}

export const BELL_RULES: SliceCommandRules = {
  'bell.ring': {
    fields: { strokes: 'wholeNumber' },
    reject: (_state, { payload }) => (payload.strokes > 3 ? rejectionOf('bell.cracked', 'too many strokes') : null),
    apply: (state, { payload }) => ({ state, events: [{ type: 'bell.Rung', strokes: payload.strokes }] }),
  },
  // 'debug.bell.setStrokes': { ... }
}

// src/features/<slice>/logging.ts: outside systems/, which may not import logging types
import type { SliceEventProjections } from '../../logging/registries/eventProjections'
import type { SliceRunEvents } from '../../logging/registries/runEvents'
export const BELL_PROJECTIONS: SliceEventProjections = {
  'bell.Rung': ({ strokes }) => ({ event: 'bell.rung', data: { strokes } }),
}
export const BELL_RUN_EVENTS: SliceRunEvents = {
  'bell.rung': { group: 'progression', level: 'core', payload: { strokes: 'integer' } },
}

// src/features/<slice>/debug.ts: a state-changing action replays and logs debug_command_applied
import { submitSliceDebugCommand } from '../../debug/sliceDebugCommands'
export const bellDebugActions = {
  setStrokes: (strokes: unknown) =>
    submitSliceDebugCommand({ type: 'debug.bell.setStrokes', payload: { strokes: strokes as number } }),
}

// register.ts
r.commandRules(BELL_RULES)
r.eventProjections(BELL_PROJECTIONS)
r.runEvents(BELL_RUN_EVENTS)
r.debugActions(bellDebugActions)
```

- Prefix every command, event type, run event name and rejection reason with the slice id; the registrar refuses an unprefixed command, projection or run event.
- Adding or changing a command or domain event bumps `AUTHORITY_PROTOCOL_VERSION`, in the ticket's last commit under rule 5.5 (feature-slices.md 5.4). A new run event name keeps `LOG_SCHEMA_VERSION`.

## Commits

Start each message with the slice id, e.g. `ores: add the band-3 catalogue rows (#146)`. Never put a closing keyword before `#<number>`. Version bumps go in the ticket's last commit under rule 5.5 of the standard.
