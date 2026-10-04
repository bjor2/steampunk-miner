# Review checklist

Run over every touched file before finishing. A "no" is a change to make, not a note to write.

## Functions
- [ ] Every function, hook, store action and `useFrame`/physics-step body is either an orchestrator (only calls, plus at most a guard, a busy try/finally, or returning the last call) or an implementer.
- [ ] Reading an orchestrator's calls in order explains the workflow without opening the steps.
- [ ] No function mixes two levels of detail; nesting is shallow; no long predicate inline in a condition or in JSX.
- [ ] Every extraction makes intent clearer; none exists only to shorten a function.

## Names
- [ ] Verb first, game noun after; the name states the effect or the question.
- [ ] No `handle`, `process`, `data`, `info`, `manager`, `util(s)`, `helper` hiding a rule, in functions, types, hooks or file names.
- [ ] No boolean argument that changes the outcome; booleans read as questions.
- [ ] Comments say why or name the ported source; none restates the code.

## Modules and state
- [ ] One reason to change per module; nothing over ~300 lines (store ~400, component ~200) without a collaborator.
- [ ] Pure rules are in `systems/` with no React, store, Rapier or `import.meta.glob` in their import graph; ported maths is literal.
- [ ] One writer per store slice, body motion, save section and external system; Rapier is touched only in its motor layer.
- [ ] Time reaches rules as an argument; scene numbers are named constants with their source.

## Components
- [ ] Component bodies hold UI state and one-call handlers only; markup does not compute.
- [ ] Shared state is one store that owns its actions, read with narrow selectors; no callbacks threaded three levels, no component refs in modal state.
- [ ] UI kit used; any one-off says why; classes live in a CSS Module beside the component, none in a global sheet.

## Frame loop and physics
- [ ] Nothing that changes every frame goes through `setState` or a store; per-frame UI is written on a ref.
- [ ] No allocation in `useFrame` or step callbacks; scratch is memoised and copied before crossing modules.
- [ ] Motion and exposure run on the fixed physics step; no dynamic body is teleported; kinematic movers wake their riders.

## Tests
- [ ] Every behaviour touched has a `describe(area)` / `it(behaviour sentence)` test on a seam that survives refactoring.
- [ ] No test asserts private helpers, JSX structure, class names or render order.
- [ ] No test pins a known bug; a fixed bug brought its test in the same commit.
- [ ] Frozen test layers were neither run nor extended; what only the eye can check was checked by hand and said in the commit.

## Finish
- [ ] Typecheck clean, touched suites green, one commit per coherent step, message says why, staged by path, nothing pushed, no secrets staged.
