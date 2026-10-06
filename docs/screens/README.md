# Screen matrix review shots

The look set of every reference screen in the #173 decision, written by the Playwright screen
matrix (`e2e/browser/screens/`, one project per cell in `screenCells.ts`). They are for review by
eye. No test compares them; the matrix asserts geometry and counts through the DOM and
`steampunkDebug` (testing rulebook, section 5).

Regenerate after a change to the look, then commit the folder:

```
npm run screens:update
```

The command builds the preview, runs `reviewShots.spec.ts` in every cell and writes
`docs/screens/<cell>/<shot>.jpg`. The Game Director reviews them against the per-device bar in
#173 section 1 before a build that changes them merges.

| Cell              | Window (CSS px) | DPR   | Notes                      |
| ----------------- | --------------- | ----- | -------------------------- |
| `desktop`         | 1920 x 1080     | 1     | the primary target         |
| `ultra-wide`      | 2560 x 1080     | 1     | zoom-out capped at 15.86 m |
| `32x9`            | 3840 x 1080     | 1     | pillarboxed to 2560 px     |
| `tv`              | 3840 x 2160     | 1     | TV mode on                 |
| `tv-1080p`        | 1920 x 1080     | 1     | TV mode on                 |
| `phone-landscape` | 844 x 390       | 3     | iPhone 13 class, touch     |
| `pixel-landscape` | 915 x 412       | 2.625 | Pixel 7 class, touch       |
| `phone-portrait`  | 390 x 844       | 3     | the turn-your-device card  |
| `tablet`          | 1180 x 820      | 2     | touch                      |

## The shots

#173 names four shots per size: the dock with both buildings, a dig with 3 chips and a discovery
plaque, the workshop mid-chain, and the tech tree. Their features are later tickets, so until each
lands its slot holds today's nearest screen:

| Shot           | Today                                        | Becomes, when it lands        |
| -------------- | -------------------------------------------- | ----------------------------- |
| `dock.jpg`     | the rig on today's pad                       | both shop buildings (#175)    |
| `dig.jpg`      | a fresh shaft below the pad                  | 3 chips and a plaque (#178)   |
| `workshop.jpg` | the Upgrade bay screen                       | the workshop mid-chain (#177) |
| `settings.jpg` | the settings screen, stand-in for a big menu | the tech tree (#165)          |

The portrait cell writes only `portrait-card.jpg`.
