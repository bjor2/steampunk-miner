# Reference: the rules with code

## 0. One set of principles, two stacks

Each principle from `osilion-dev-netblazor` has a counterpart here. Where the table says "same", the
netblazor wording applies unchanged.

| Principle | .NET + Blazor | TypeScript + R3F |
|---|---|---|
| Orchestrate or implement | service methods | same, and it covers hooks, zustand actions and `useFrame` bodies |
| Intent-revealing names | `StampAndMergeDocumentGroupAsync` | `stampAndMergeDocumentGroup`; no `handleX`, `processX`, `utils.ts` |
| One job per class | service < ~250 lines | module < ~300, store < ~400, component < ~200 |
| Pure rules, stable address | domain layer, no I/O | `src/systems/`: no React, store, Rapier or `import.meta.glob` |
| Seams around external systems | SAP gateway, PDF stamper, `TimeProvider` | Rapier motor layer, `dt` passed in, checkpoint for saves, shell bridge |
| One writer per external state | one class writes status to SAP | one module per store slice, per body's motion, per save section |
| One page-state object | cascaded `OrderPageState` | one zustand store that owns the actions, read with narrow selectors |
| Busy/alert plumbing in one helper | `RunWithAlertAsync` | one `runBusy` helper or a store action that owns `busy` |
| Shared components first | project component library | the UI kit, tokens, CSS Modules beside the component |
| Tests on seams | bUnit, API + LocalDB, domain | vitest on `systems/` and store actions, start scenarios for setup |
| (new here) Hot state out of the UI framework | - | per-frame data in refs/registries, never `setState` per frame |
| (new here) Deterministic clock | `TimeProvider` | fixed physics step; behaviour identical at 8 and 144 fps |

## 1. Orchestrate or implement, including the frame loop

Before: one `useFrame` reads the body, allocates, decides, cooks and writes the UI.

```tsx
useFrame((_, delta) => {
  const body = bodyRef.current
  if (!body) return
  const pos = new THREE.Vector3().copy(body.translation())            // allocates every frame
  const onPan = surfaces.some(s => s.kind === 'panBowl' && s.contains(pos))
  if (onPan && pan.heat > 0.2 && !carry.isHeld(item.id)) {
    cook.expose(pan.heat * delta)                                    // render delta drives a rule
    if (cook.burnt > 0.8) useGameStore.setState({ warning: 'Burning!' })
  }
  if (Math.abs(pan.velocity.x) > 0.01) body.wakeUp()
})
```

After: the per-step orchestrator is a list of named steps on the physics clock, with scratch reused.

```tsx
const scratch = useMemo(() => ({ point: new THREE.Vector3() }), [])

useBeforePhysicsStep(() => {
  const body = bodyRef.current
  if (!body) return
  readBodyPoint(body, scratch.point)
  wakeIfPanIsMoving(body, pan)
  exposeToPanHeat(cook, scratch.point, PHYSICS_TIMESTEP)
})

useFrame(() => writeCookReadout(readoutRef.current, cook))   // presentation only
```

The rule (`isOnHotPan`, `exposure`) lives in `systems/cookModel.ts` and is tested there. The warning is
a derived reading the slate computes from `cook`, not a store write from inside the loop.

The same shape for a store action:

```ts
sellOrder: (orderId) => {
  const order = findOpenOrder(get().orders, orderId)
  if (!order) return
  set(state => recordSale(state, order))        // pure, in systems/, tested there
  emitStockEvent({ kind: 'sold', order })
},
```

## 2. Naming table

| Before | After | Why |
|---|---|---|
| `handleClick` | `pickUpSausage` | the handler's name is the effect |
| `processItems(items, true)` | `packItemsIntoBag` / `packItemsIntoTray` | a flag that changes the outcome is two functions |
| `updateData()` | `recordSale()` | "data" says nothing |
| `utils.ts`, `helpers.ts` | `bagPacking.ts`, `cookBands.ts` | the module is named for its one job |
| `SausageManager` | `sausages` registry + `spawnSausage` | "Manager" hides several jobs |
| `useStuff()` | `useStationReadout(stationId)` | hooks follow the same verb/noun rule |
| `valid` | `canAffordUpgrade` | booleans read as questions |
| `type OrderData` | `type Order` | the suffix adds nothing |

## 3. Splitting a module or store

A 1000-line store with twenty actions is several reasons to change. Split by reason to change, keep the
exported surface delegating until callers move, delete the old module when empty, update tests in the
same commit:

- `xStore` - what the UI renders and the actions that change it
- `xRuntime` - the mutable, per-frame side (registries, timers), no React
- `xCheckpoint` - the only reader/writer of the save section
- `systems/x.ts` - the pure rules both of the above call, with the tests

Seams to add before tests, all behaviour-preserving:

```ts
// time is an argument, so the rule is frame-rate independent and testable
export function advanceCook(bands: CookBands, heat: number, dt: number): CookBands
// Rapier is touched in one layer; placement maths never raycasts
export interface CarryMotor { driveToward(target: Vector3Like, dt: number): void }
// saves go through one owner per section
export interface Checkpoint<T> { capture(): T; restore(saved: T): void }
```

Asset discovery (`import.meta.glob`) stays in the loader modules, never in `systems/`, so node tests and
anything else importing rules never pull in Vite-only code.

## 4. Components: one store instead of prop and context chains

Before: a page threads `order`, `onApprove`, `onReject`, `busy` through four levels and two contexts;
a modal receives the row component's ref to call back into it.

After:

```ts
export const useOrderPanel = create<OrderPanelState>()((set, get) => ({
  order: null, busy: false, rejecting: null,
  approveFile: async (fileId) => runBusy(set, () => approveAndReload(get, fileId)),
  requestReject: (fileId) => set({ rejecting: fileId }),
  confirmReject: async (comment) => runBusy(set, () => rejectAndReload(get, comment)),
}))
```

```tsx
// the panel reads as a table of contents
export function OrderPanel() {
  return (
    <Slate title="Order">
      <OrderHeader />
      <OrderLineList />
      <RejectFileModal />
    </Slate>
  )
}

function ApproveButton({ fileId }: { fileId: string }) {
  const approveFile = useOrderPanel(s => s.approveFile)
  const busy = useOrderPanel(s => s.busy)
  return <button disabled={busy} onClick={() => approveFile(fileId)}>Approve</button>
}
```

Markup does not compute: `const canServe = isCooked(cook) && hasBun(tray)` above the return, or a
selector in `systems/`, never `{cook.value > 0.6 && cook.burnt < 0.2 && tray.buns > 0 && ...}` inline.

A reading that changes every step is written imperatively on a ref, not through React:

```tsx
const trackRef = useRef<HTMLDivElement>(null)
useFrame(() => trackRef.current?.style.setProperty('--meter-value', String(cook.doneness)))
return <Meter ref={trackRef} value={0} label="Cook" />
```

## 5. The frame loop and physics

- Scratch objects in `useMemo`; a function that returns a vector takes an `out` argument instead.
- Before passing a vector to another module, copy it into your own scratch; a shared scratch mutated
  mid-query is a real bug class (a lookup clobbering the point being tested against it).
- `useBeforePhysicsStep`/`useAfterPhysicsStep` for anything that moves or exposes; `useFrame` only for
  presentation. Test the rule at two step rates and assert the same outcome.
- Held and thrown items stay dynamic and are driven by velocity toward a target; teleporting drops
  collisions and momentum. Kinematic movers wake what rests on them while moving.
- Named constants for body types, collision groups and scene coordinates, each with its source.

## 6. Tests on seams

| Seam | Test kind | Assert | May change freely underneath |
|---|---|---|---|
| Pure rules (`systems/`) | vitest, node, no mocks | return values against the ported formula | callers, stores, components |
| Store actions | vitest, real stores, reset in `beforeEach` | resulting state, emitted events | action internals, module split |
| Start scenarios | the repo's scenario spec | the state a test begins in, refused if illegal | how the game reaches it |
| Rendered game | by hand in the dev build, console hooks | what the camera shows, how input feels | everything |

Rules: `describe` names the area, `it` states the behaviour as a sentence ("takes the same time at
8 fps as at 144"). One behaviour per test. Set up state through a start scenario or a store action, not
by poking private fields. Frozen layers (for example e2e in this repo) are not run or extended; if a
change cannot be trusted without them, say so and let the user decide. A test that breaks during a
behaviour-preserving refactor was written on the wrong seam: move the seam, not the code.

## 7. The refactor sequence that keeps suites green

0. Seams: time as an argument, Rapier behind its motor, checkpoints, constants lifted with their source.
1. Tests on the pure rules. 2. Tests on the store actions.
3. Lift rules out of components and stores into `systems/`.
4. Split stores and runtimes behind the unchanged exported surface.
5. Replace prop/context chains with the store; remove component references in modal state.
6. Split components one file at a time, checking the result by hand in the dev build after each.
7. Rename, delete dead code, run the review checklist.

Every step: `npm run typecheck`, touched suites green with no test edited (moved imports updated in the
same commit and named in the message), one commit per step, no defect fixed, no text or feel changed.

## 8. Commits

One coherent change per commit. The message says why and what stays the same, not which files moved.
Stage by path, never `-A`; other sessions may share the checkout. Never push unasked. No secrets staged.
