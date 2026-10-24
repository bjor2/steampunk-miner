# Context

The words this codebase uses for its domain, one line each. Code, tests and tickets use them as
written here.

- **Planet row**: a planet's registry row: species pool, frozen radius, display name and look,
  owned by the `ores` slice and read by the kernel through the planetRow registry.
- **Merchant variant**: a planet's data row on the #175 dock shops: name, the planet's own pool it
  buys, one premium ore and its stock; one shop system, variants differ in data only. Owned by the
  `planet-kit` slice, keyed on the stable planet id (s,p).
- **Kit item**: a planet's signature tool or consumable that turns the planet's hazard into a
  choice with a trade-off; a tool is sold at its home merchant and every later one, a consumable at
  home only. Owned by the `planet-kit` slice; prices key on g.
