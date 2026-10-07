# Economy tables (planning aid)

Source of truth: [the scaling and curves decision](https://github.com/bjor2/steampunk-miner/issues/6)
and [the core harvest and travel decision](https://github.com/bjor2/steampunk-miner/issues/10).
These files are generated views of those formulas for planets 1 to 40. They are a first draft that
proves the shape of the curves; the greedy-bot simulation in `tools/sim.py` is a planning aid, not
final balance. Nothing here is game code.

- `economy-constants.json`: the constants from the decision, as decimal strings and integers.
- `planet-table.md`, `vehicle-table.md`, `price-table.md`, `enemy-table.md`: one row per planet.
- `tools/gen.py` regenerates the tables from the constants. `tools/sim.py` is the pacing simulation.

The game reads its constants from `src/systems/economy/economy.json`; the pure formulas in
`src/systems/economy/` render these four tables again, and `economyTables.test.ts` compares them cell
by cell. Change a number in `economy.json` and regenerate these tables together.

## Two-tier levels (spec #180 sections 3 and 4, built in #181)

The tables list **major levels** `L`, today's curves. A vehicle stores each track (and the guns) as a
**step** `m = 10L + k`, read from `upgradeTiers` in `economy.json` (`minorsPerMajor` 10,
`minorStatShare` 0.5):

- **Price** (`stepPrice`, `upgradeSteps.ts`): the ten steps of major `L` split its level price `X_L`
  by rounded running totals `ceil(X_L * F(k))`, `F(k) = (rho^k - 1) / (rho^10 - 1)`,
  `rho = ratio^(1/10)` (`nthRoot` in `money.ts`, no `Math.pow`). The tenth step is the remainder, so
  the ten always sum to exactly the level price in the price table.
- **Stat** (`stepStats.ts`): each curve at `x = L + k/18`; cargo and boiler round their pips half up,
  the engine saturates on `x`. At `k = 0` every stat is the vehicle table's value.
- The design tables do not change, because they read majors. `npm run balance:report` prints the
  pacing bot's spree targets (median steps a visit, and the share of above-median trips that could
  chain 10 steps).
