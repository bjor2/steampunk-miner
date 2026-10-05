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
