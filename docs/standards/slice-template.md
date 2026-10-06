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
  index.ts                public API: types, read selectors, constants (intents after K1)
  register.ts             export const slice: SliceDefinition; no side effects at import
  <slice>.economy.json    the slice's numbers (optional)
  systems/                pure rules: the authority lint set (exact maths, no clock or random)
  systems/render/         pure look maths: exempt from the exact-maths set only
  store/                  optional zustand store fed by listenForDomainEvents
  ui/                     React + CSS Modules
  scene/                  R3F components
  icons/<icon-id>.svg     found by the kernel icon registry
  debug.ts                debug actions (optional, read-only until K1)
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
| `gateCheck(check)` | `gateChecks.ts` | Verdict `cut`, `refused` or `lost`, or null for no opinion. |
| `blastEffect(effect)` | `blastEffects.ts` | Runs after the kernel's blast, in id order. |
| `generationHook(hook)` | `generationHooks.ts` | Integer-only folds; the hook's seed is `subSeedForHook(params, hook.id)`. Adding one bumps `GENERATOR_VERSION`. |
| `oreLook(provider)` | `oreLook.ts` | One provider (`ore-visuals`). |
| `saveSection(section)` | `saveSections.ts` | Its own `version`, matched exactly on restore. |
| `discovery(provider)` | `discovery.ts` | One provider (`codex`). |
| `loadoutAcceptance(rule)`, `attachUse(use)` | `vehicleLoadout.ts`, `vehicleAttach.ts` | Item slices only. |
| `hudPanel(panel)` | `src/ui/registries/hudPanels.ts` | The panel reads the slice's own store and takes no props. |
| `debugActions(actions)` | `src/debug/debugActionRegistry.ts` | Exposed as `steampunkDebug.features['<slice>']`. |

Registries are read only after `loadFeatures()` has sealed them, so no slice module reads one at import time.

## A real slice also adds

- `<slice>.economy.json`
- `store/`, fed by `listenForDomainEvents`, with a `reset<Slice>Store()` for `beforeEach`
- `ui/` with CSS Modules
- `icons/`
- after K1, a `declare module` augmentation of `CommandPayloads` and `DomainEventBodies` in `systems/`

## Commits

Start each message with the slice id, e.g. `ores: add the band-3 catalogue rows (#146)`. Never put a closing keyword before `#<number>`. Version bumps go in the ticket's last commit under rule 5.5 of the standard.
