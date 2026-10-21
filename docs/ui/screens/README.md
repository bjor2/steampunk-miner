# UI screenshot suite shots

The shots of the UI screenshot suite (spec #678, ticket 689), written by
`e2e/browser/ui/uiShots.spec.ts` for review by eye. No test compares them (testing rulebook,
section 5). The suite fails on geometry instead, read through the DOM and `steampunkDebug`:

- text that runs out of its box or its panel, or the page scrolling sideways;
- a button, link, field, tab, slider or switch a tap can reach that is under 44 px either way;
- the HUD over its coverage budget, 12% of a phone screen and 8% of desktop, as the #682 overlay
  reports it (`ui.getHudCoverage()`);
- any HUD box or touch control in the middle band (30% to 70% of the height between the 8 px edge
  lanes), where the drill head sits.

Coverage and the band are judged on the HUD shots only. A sheet is a mode, not HUD
([design-system.md](../design-system.md) section 9), so it is judged on overflow and targets.

Regenerate after a change to the look, then commit the folder:

```
npm run ui:screens:update
```

It runs the suite and writes `docs/ui/screens/<cell>/<shot>.jpg`. A failing test still writes its
shot first, so the picture of a broken layout is there to look at.

| Cell               | Window (CSS px) | Layout  | Budget |
| ------------------ | --------------- | ------- | ------ |
| `phone-360x640`    | 360 x 640       | phone   | 12%    |
| `phone-390x844`    | 390 x 844       | phone   | 12%    |
| `desktop-1280x800` | 1280 x 800      | desktop | 8%     |
| `desktop-1440x900` | 1440 x 900      | desktop | 8%     |

The phones are Chromium emulation (`isMobile`, `hasTouch`) at DPR 1, not shots from a device.

| Shot             | What it shows                                   |
| ---------------- | ----------------------------------------------- |
| `hud-surface`    | the HUD on the pad, the bay shut                |
| `hud-dig`        | the HUD two tiles down, drilling                |
| `sell-bay`       | the Sell bay                                    |
| `upgrade-bay`    | the Upgrade bay (the Outfitter) and its plaques |
| `settings`       | the settings, opened from the bay               |
| `pause-menu`     | the pause menu                                  |
| `save-page`      | the pause menu's save page                      |
| `tech-tree`      | the tech tree's map                             |
| `tech-tree-list` | the tech tree's list                            |
| `planet-card`    | the planet card on arrival at planet 25         |
| `base-sheet`     | the shared sheet on the example's probe tabs    |
| `title-menu`     | the title menu                                  |

The sheets are a table, `e2e/browser/ui/uiShotSheets.ts`: a sheet the shared sheet component (#686)
or a later ticket adds joins as one row.

Bjor's phone on 21 Oct 2026 showed stacked panels over the top third of the screen. The 360x640
`hud-surface` and `hud-dig` shots show that view, and the suite holds it to the 12% budget.
