# UI design system: the steampunk visual language and its tokens

Spec [#678](https://github.com/bjor2/steampunk-miner/issues/678) (UI redesign, phone first), ticket
[#679](https://github.com/bjor2/steampunk-miner/issues/679). This is the one place the UI's look,
motion, sound, layout limits and copy rules live. Every number here is a token in
`src/data/design/designTokens.json`, read by `src/systems/views/designSystem.ts`, and every rule of
the map's GD lock (21 Oct) is in section 15 as a token or a limit. The tables in section 16 are the
token reference; `designSystemDoc.test.ts` fails when a token and this document disagree.

**Who reads what.** A build ticket reads the section it touches and takes the numbers from the
tokens, never from this prose. #682 turns the tokens into `src/ui/kit/tokens.css`; #683 bakes the
art of section 13; #684 builds the strip of section 9; #685 the warning layer of section 8; #686 the
sheet of section 10; #691 the slot bar; #689 measures all of it. A planet or a module reuses the
system by adding data (section 14); a new _kind_ of thing needs a ticket and Bjor's sign-off.

**What does not change.** No rule, price, number or save shape (GD lock: no economy change). The
formatter of section 12 shows values; it never rounds what the authority holds.

## 1. The language in one paragraph

A mining rig's instrument panel, read at a glance in a shaking cab. Dark enamel plates carry brass
bezels and thin brass frames; readings are gauges and bars, not sentences; the few words are set
in an engineer's ledger voice. Light comes from inside: a parchment dial face, an amber lamp, the
ember of heat. Brass is the frame, never the fill: a bar fills with the colour of what it measures
(copper hull, amber fuel, verdigris cargo, ember heat). Copper and amber belong to the Sell side,
steel and teal to the Outfitter (#45). Every state is told by shape, icon and sound as well as
colour (#13). Motion is short and mechanical: a shutter slides, a needle swings with a little
overshoot, digits roll on a drum. Nothing bounces, fades slowly or glows for decoration.

## 2. Colour

The base palette carries over from `tokens.css` (#13, #41, #105, #423): a warm dark ground, a
brass frame colour, copper and amber accents, teal and verdigris for what holds, ember for heat, a
parchment for faces and a lighter parchment for text at about 14:1 on the ground. Four of them
(`accent`, `accentSoft`, `glow`, `dialFace`) are the **skinnable** tokens: a planet overrides those
and nothing else (section 14), so a heat planet's frames glow ember and planet 2's violet without
a single limit moving. `danger` is the ladder's last tier (section 8), the one red in the UI.

Rules:

- Colour never carries a state alone (#13, #45 acceptance 4): a warning also hatches, pulses an
  icon and sounds; affordable and short-of-money rows differ by icon and text, not only grey.
- Text is `colour.text` on panels and `colour.parchment` on dial faces, never brass on dark for
  more than a label (brass on the ground is about 7:1, enough for labels at 14 px, not for prose).
- Panels are `colour.panel` at `panelOpacity` (0.85, #45) so the world stays visible behind a
  sheet; the strip is opaque enamel, because bars must read on any ground.

## 3. Materials

A material is three stops (highlight, base, shadow) rendered as a vertical gradient on frames and
bezels and as the rim light of a sprite. The Blender art (section 13) bakes the same three stops
so a CSS frame and a baked frame sit together without a seam.

| Material  | Used for                                                           |
| --------- | ------------------------------------------------------------------ |
| brass     | frames, bezels, rails, rivets, the needle hub, tab edges           |
| copper    | the Sell side's accents, the hull bar's fill                       |
| iron      | the enamel plate behind every panel, slot wells, the scroll trough |
| steel     | the Outfitter's accents, disabled controls' frames                 |
| parchment | dial faces, the odometer's drum, the sheet's paper                 |
| glass     | a `glassSheenOpacity` white sheen over any gauge face, top third   |

A gauge bar is: an iron well, a brass bezel (`framePx.bezel`), a fill in the readout's colour
(`gaugeFills`), the glass sheen. A dial is the same with a parchment face and a brass needle. A
rivet is a `framePx.rivet` dot of brass at each corner of a double frame (`framePx.double`), as the
plaque draws today. Nothing in the UI is photographic: flat colour with the three stops, so the
whole system re-skins through tokens.

## 4. Type

Two faces: the body serif for words (`type.fontBody`, the ledger voice) and a monospace stack for
every numeral (`type.fontNumerals`, tabular, so a rolling odometer and a column of prices never
jitter). Sizes are CSS px at `--ui-scale` 1 and grow with it (#173); the floor is **14 px** for
anything a player reads (GD lock), which raises the kit's 12 px labels to 14. `--text-min` (15 px,
#423) stays as the panel floor since it is above 14.

| Role     | Px  | Where                                                            |
| -------- | --- | ---------------------------------------------------------------- |
| label    | 14  | gauge labels, tab names, status words; uppercase, tracked 0.08em |
| body     | 16  | card lines, hover lines, toasts                                  |
| odometer | 18  | the money drum, depth on the strip                               |
| title    | 20  | sheet and card titles                                            |
| display  | 24  | the planet name on arrival, the surface money readout            |

Line height is 1.3 everywhere. TV mode's percentages (#173) and the bay screens' 2.2% of the
short axis (#45) still apply on top: the floor is a floor.

## 5. Spacing, radius and frames

A 4 px scale (`spacePx` 4, 8, 16, 24, 32), each multiplied by `--ui-scale`. Panels round at 6 px,
cards at 4 px, chips are pills at 12 px. Frames are 1 px hairlines inside a sheet, 2 px bezels round
a gauge, a 3 px double frame round a plaque or a card that acts. Margins to the screen edge are
`layout.marginPx` past the safe-area inset. Tap targets are at least `layout.tapTargetMinPx` (44)
and `layout.coarseTargetPx` (56) under a finger, as `--control-min` already enforces (#173).

## 6. Motion

Every transition is **200 ms or less** (`motion.transitionMaxMs`); the four durations are
`instant` 80 (a press), `quick` 120 (a tab, a reveal), `standard` 160 (a card, a chip), `sheet` 200
(a sheet's shutter, #45's 0.25 s brought under the cap). Enter eases out, exit eases in. Feedback
animations are not transitions and have their own caps:

- **Needle:** eases over 150 to 250 ms (`motion.needle`) with a 6% overshoot on the spring
  (`motion.easing.needle`), and is **never more than 300 ms behind** the value it shows; a value
  that keeps moving re-targets the ease, never queues (G&V).
- **Odometer:** digits roll on a drum, 120 ms a digit, the whole roll **0.6 s or less** however
  far the value jumps (`motion.odometer`, Systems). A roll past the cap skips to the last three
  digits' turn.
- **Money float-up:** the delta rises and fades over `motion.floatUpMs` (600) from the readout.
- **Edge glow:** pulses at `motion.glowPulseMs` (1 s) while a ladder tier holds.
- **Toast:** at most `motion.toastMaxMs` (2 s) on screen, then gone with a `quick` fade.

**Reduce Motion** (`motion.reduceMotion`, the OS setting and the reduced-effects pref of #389):
transitions become fades of the same length, the needle snaps, the odometer sets, the float-up
fades in at rest, the glow holds steady. Nothing is dropped, so every cue still shows.

## 7. Feedback: the warning ladder, glows and haptics

Every bounded readout (hull, fuel, cargo room, heat room) warns on the same three-tier ladder
(`warningLadder.tiers`): **low at 30%, critical at 15%, empty at 0%** of the whole, each tier
firing **once on the way in** and re-arming only once the reading climbs `rearmPercent` (5) above
the tier again (G&V). A tier is an edge glow (section 10) in the tier's colour, the readout's
icon pulsing on the strip, the tier's sound cue and a haptic pulse (`hapticMs` 10, 30, 60) under
the haptics setting (#173). Never a text box during a cut (GD lock); the words live in the detail
behind the gear button. Cargo warns on room left and heat on room to the limit, so one rule covers
a bar that fills and a bar that empties. The HUD's old `hullCriticalPercent` 25 in
`data/hud/hud.json` is gone: hull critical is the ladder's 15% tier since #685, so no second
threshold survives.

**The warning layer as built** (#685): `stepWarningWatch` (`systems/views/warningWatch.ts`) reads
the strip's bars (hull and fuel left, cargo room), the heat line's room and the collapse status,
which stands at the critical line while a block near the rig telegraphs (a yes or no, pulsing fast
like a critical hull). A reading that drops past several tiers at once rings the deepest alone. The
HUD feeds the store's warning slice on each re-read, so nothing fires while the HUD is down. The
glow (`ui/hud/WarningGlow.tsx`) is the deepest tier any reading stands in now, carries no
`data-hud` box and no words; the warning readout's glyph on the strip (the heat line itself)
pulses with it. The bells are the kernel's `ui.warn.*` cues, looked up beside the slices' cue
registry (a slice's ids carry its prefix, so none can take a `ui.` id), ducked 6 dB while the drill
cuts. `ui.getWarnings()` reads the glow, the watch and the run's firings. On a phone the hazard
strip of #316 keeps its reach and line along the drive but slides out of the shaft to the edge:
the left edge lane for a drive up or down, under the strip for a drive across
(`hazardStripEdgeShiftInto`). The status row holds 3 icons on a phone and 6 on desktop from the
same priority list (`statusIconsMaxOf`). No toast was built: a warning never needs one, and the
toast component stays with the first ticket that shows one.

Haptics (`haptics`): 10 ms on a tap and on a long press that opens a card, the ladder's pulses
above, all behind the one haptics setting; the drill and hit pulses of `constants/touch.ts` stay
as they are.

## 8. Sound cues

Every UI sound is a synthesised cue (#13) registered under the sound cue registry
(`systems/registries/soundCues.ts`) with its voice budget, ids under `ui.`; a slice's own cues keep
the slice prefix (`workshop.ratchet`, `mining-gates.clank`). Families tell the player what kind of
thing happened before the eye does: a **click** is a press, a **ratchet** is a choice taking, a
**shutter** is a sheet, a **chime** is money in, a **clank** is a refusal or a scrap, a **bell** is
the ladder (descending in pitch low, critical, empty), a **tick** is a mechanism turning, the
**whistle** is departure. The list is `soundCues` in section 16: id, voices, family, the longest
it rings, when it plays. A refusal is always the clank, never silence (#45, ticket 317). The
`ui.warn.*` cues duck under the drill voice as the music does (#49).

## 9. Layout: breakpoints, keep-outs and the coverage budget

**Two layouts, one source.** The breakpoint is the HUD density switch of #500 ruling 5
(`layout.breakpoints.phone`): a short axis under 800 px on a coarse pointer, or under 500 px on
any pointer, is the **phone** layout; everything else is **desktop**, a first-class layout equal to
phone (Bjor via HS). Orientation (`data-orientation`) only changes how the slot cells stack.
Safe-area insets (`--safe-*`, ticket 483) push every box inward; they never shrink it.

**Keep-outs.**

- The **top keep-out** (`layout.topKeepOutPercent` 15): on a phone nothing in the top 15% takes a
  tap. The strip lives there and is read-only; its detail opens from the gear button in the thumb
  zone.
- The **middle band** (`layout.middleBand` 30% to 70% of the height, between the two
  `layout.edgeLanePx` edge lanes): where the drill head sits at every zoom short of the full-speed
  lean. No HUD box enters it, ever. The camera's static keep-clear rect (`vehicleKeepClearOf`,
  14% to 86% at 360x640) is wider than any screen could leave room under for a 44 px control, so
  the band is the static rule and the vehicle's actual screen box (`vehicleScreenBoxOf`) stays the
  dynamic never-cover rule of #500. "Below the rig" is the dynamic rule: no readout or panel is
  drawn in the column under the vehicle's box.
- The **thumb zone** (`layout.thumbZoneHeightPercent` 45) holds every control on a phone; the
  stick's input zone (`layout.stickZoneWidthPercent` 40 of the width, on the thumb's side) draws
  nothing and no HUD box intersects it (#500 ruling 1).

**The reserved boxes.** The HUD's area is three boxes laid out from the tokens by
`hudCoverageBudget.ts`; everything else over the view is a transient (a float-up, a toast under
2 s), an edge (a glow, the hazard strip of #316) or a sheet, which is a mode, not HUD.

| Box        | Phone                                                                       | Desktop                                                   |
| ---------- | --------------------------------------------------------------------------- | --------------------------------------------------------- |
| strip      | full width to 600 px, 36 px tall, under the top inset                       | 720 px centred, 44 px tall                                |
| tool slots | 4 slots + overflow + gear: 3x2 grid of 44 px upright, one row of 6 sideways | 8 slots + overflow + gear, one row of 48 px, bottom right |
| edge gauge | 4 px wide in the right edge lane, spanning the middle band, surface to core | the same                                                  |

**Coverage budget** (`layout.coverageMaxPercent`): the union of every `data-hud` box is at most
**12% of a phone screen and 8% of desktop**. The worked budget at the #689 cells, insets on:

| Cell             | Strip     | Slots  | Edge gauge | Total      | Budget |
| ---------------- | --------- | ------ | ---------- | ---------- | ------ |
| 360x640 phone    | 12,960 px | 12,880 | 1,024      | **11.66%** | 12%    |
| 390x844 phone    | 14,040    | 12,880 | 1,352      | 8.59%      | 12%    |
| 844x390 sideways | 21,600    | 12,496 | 624        | 10.55%     | 12%    |
| 1280x800 desktop | 28,160    | 24,768 | 1,280      | 5.29%      | 8%     |
| 1440x900 desktop | 31,680    | 24,768 | 1,440      | 4.47%      | 8%     |

`hudCoverageBudget.test.ts` proves these; the #682 overlay reports the measured union of the real
boxes and marks the band; #689 fails on a box over budget or inside the band.

**The coverage overlay** (#682): `steampunkDebug.ui.showHudCoverage(true)` draws the middle band,
the phone's top keep-out and stick zone, these reserved boxes (dashed brass) and every measured
`data-hud` box (red inside the band) with one line, `HUD <measured>% / <budget>% · layout
<reserved>%`; `ui.getHudCoverage()` returns the same report (`hudCoverageReport.ts`). Touch
controls are left out, as above. The reserved layout is the budget the rebuild fills (11.66% at
360x640, 4.47% at 1440x900); the measured share is today's HUD until #684 replaces it.

**The strip as built** (#684): the gauges, readouts and status panels are gone; `HudStrip` (a
`strip` box) holds the three bars (`kit/GaugeBar.tsx`), the heat line, one number (money on
`kit/Odometer.tsx` with the next-upgrade chip on the surface, depth underground) and the status
row, all read from `hudStripOf` (`systems/views/hudStrip.ts`). `EdgeGauge` is the `edge-gauge` box.
The gear button is the `gear` box at the slot cell's size (44 px on a phone, under the kit's
coarse 56 px `--control-min`, so it fits between the band's foot and the touch cluster at
360x640, the cluster's foot moved to the layout margin there; the tool slot bar's last cell since
#691); it opens `HudDetail`, a plate that
is a mode, not a box, with every exact value and word the panels showed, their ids unchanged. The
"DEBUG RUN" mark labels a debug run, not the player's HUD, and carries no box. Measured headless
with the #682 report (debug build, after undocking): **11.58% at 360x640** on the pad with the dock
prompt up, 8.32% two tiles down, nothing in the band; **4.79% at 1280x800**.

**The tool slot bar as built** (#691; the G&V, GD and Producer rulings on #691). The bar is the
kernel's `ToolSlotBar` (`ui/toolSlots/`), a grid of `--slot-columns` cells of `--slot-cell` whose
last cell is the gear button. Its tools are **rows** of the `toolSlots` registry
(`ui/registries/toolSlots.ts`, rules in `systems/input/toolSlots.ts`): a touch binding (#474) with a
fixed bar **position**, a pure `faceOf(state, player)` (icon, cooldown share, charges, on, acting;
null hides the cell) and an optional cell for a press that is more than a tap. Positions: the
loadout's power-up slots 1-5 at 1-5 and the drill sockets at 6-7 (`power-up-core`, so the Fit order
is the bar order), the bore gun at 8 (`ground-gun`), and the kernel's Plant charge (9), charge size
step (10) and guns toggle (11), which left the touch cluster. A new tool adds a row; the seal refuses
a row at a position up to 8 whose `Digit<n>` does not press its action, and a position two rows
share. Layout (`toolBarLayoutOf`, `systems/views/toolSlotBar.ts`): on a phone the first 4 shown
tools by position fill the thumb cells; on desktop cell n always holds position n, so `Digit1-8`
press cells 1-8 (`Digit6/7/8` are second keys beside F, C and the fire keys). Tools past the cells
wait behind the **overflow cell**, which turns the cells through the tray a page at a time and back,
in place, so an open tray never leaves the reserved box. With no tool shown only the gear draws (#173
acceptance 3). Each cell (`ToolCell`) is an icon and a cooldown ring of `--slot-cooldown-ring`,
never text, drawn from the face each refresh with no minimum; a tool with more than one charge adds
the count through the shared formatter (#681). The charge size Plant charge plants rides its cell
read-only (#473); the tap that steps it is its own cell, so every target keeps 44 px. The bore gun's
auto lamp (GD 3b on #314) rides its cell's corner. Placement: held upright on a phone the bar stands
right-aligned on the touch cluster's one row, `--tool-bar-over-cluster-gap` (16 px) above it, so at
360x640 it is x 212-352, y 452-544 over the row at 560-632; held sideways it is one row left of
Interact, the cluster stacked into one column; on desktop it is one row at the bottom right, lifted
over the cluster while the touch controls show (two rows of five on a tablet held upright). The
slices' bottom-right gauge panels stand on the bar there (`Hud.module.css` `.gaugePanels`). A
640 px screen under a 34 px home bar has no room for the band, the bar and the cluster's row
together, so the band rule holds bare at 360x640 and with insets on the taller phones
(`hudCoverageBudget.test.ts`). Measured headless with every tool owned: the bar's cells and the gear
are 6 boxes (11,616 px², 5.04% at 360x640), inside the 12,880 px² reserved for them; at 1280x800 the
5 slots, the bore gun, the overflow cell and the gear add 1.8%.

**In CSS** (#682): every token a style sheet can use is a custom property in
`src/ui/kit/tokens.css` (named by `designTokenCss.ts`, held to the JSON by
`designTokenCss.test.ts`). The shell writes
`data-layout="phone|desktop"` on the root from the same density switch, so `--strip-height`,
`--strip-max-width`, `--slot-cell`, `--slot-columns` and `--warn-glow-thickness` follow the
breakpoint, and `--slot-columns` the orientation. `--hud-inset-*` put a box's outer edge past the
safe area (`--safe-*`): the strip right under the top inset, the other sides `--layout-margin` in.
A planet's skin is written on the root on every arrival (`ui/stage/planetSkin.ts`).

**Mockup, 360x640 (phone, upright).** Scale 1 character = 8 px across, 16 px down.

```
+--------------------------------------------+ 0      safe-top above this line
| [hull===] [fuel===] [cargo==] 1 234 m ooo |        strip 36 px: 3 bars, depth, 3 status icons
+--------------------------------------------+ 36     heat: a 4 px ember line along the strip's foot
|                                            |
|                                            |
|                                            | 192    middle band top (30%)
|                                           ||        edge gauge, 4 px, surface to core
|                    (rig)                  ||
|                      v                    ||
|                                           ||
|                                            | 448    middle band bottom (70%)
|  . . . . . . . .                 [1][2][3] | 452    slot bar 140x92, 3x2 cells of 44 px
|  .  stick zone .                 [4][+][*] | 544    4 slots, overflow tray, gear button
|  . (draws none).          [R]  [Q] [ (I) ] | 560    touch cluster: rescue, quick service, Interact
|  . . . . . . . .                           | 632    8 px margin, then safe-bottom
+--------------------------------------------+ 640
```

On the surface the strip's number is **money** with the next-upgrade chip beside it (an icon plus
a price, no label, #684 ruling); underground it is **depth**, the only always-on number. Speed is
never on the strip. The Interact button of #485 stays a touch control under the #500 clear-view
share and is not a HUD box.

**Mockup, 1440x900 (desktop).** Scale 1 character = 32 px across, 36 px down.

```
+----------------------------------------------+ 0
|     [hull==][fuel==][cargo=] 1 234 m oooooo  |        strip 720x44 centred: 6 status icons
|                                              | 44
|                                              |
|                                              | 270   middle band top
|                      (rig)                  ||       edge gauge
|                        v                    ||
|                                              | 630   middle band bottom
|  docked sheet (optional, beside the view)    |
|                    1 2 3 4 5 6 7 8 [+][*]    | 844   slot row 516x48, number-key hotkeys
+----------------------------------------------+ 900
```

A docked sheet on desktop (#686) narrows the stage instead of covering it, so it is outside the
coverage budget; its hover detail replaces the phone's tap-to-reveal.

## 10. Component inventory

Existing parts keep their contracts (texts and `data-*` hooks, never markup, #423). New parts are
listed with the ticket that builds them. Every class lives in a CSS Module beside its component;
`tokens.css` holds only tokens.

| Component     | What it is                                                                                                                                                                 | Tokens it uses                                         | Builder |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | ------- |
| strip         | the one top HUD box: three gauge bars, the heat line above 60%, depth or money + chip, status icons; read-only                                                             | layout.strip, statusIcons, gaugeFills, type.odometer   | #684    |
| bar           | a brass gauge bar, fraction only, no number; hatched under a ladder tier                                                                                                   | materials, framePx.bezel, gaugeFills, needle motion    | #684    |
| gauge         | the brass dial (`kit/Gauge.tsx`), needle on the spring ease; used in detail views, not the strip                                                                           | motion.needle, materials.brass, colour.dialFace        | exists  |
| edge gauge    | a 4 px vertical gauge in the right edge lane: surface at the top, core at the foot, the rig's mark between; no number                                                      | layout.edgeGauge, colour.accent                        | #684    |
| slot gauge    | the edge gauge on its side beside a save slot's depth (`kit/MiniGauge.tsx`): surface at the left, core at the right, the deepest dig's bead between; no number             | layout.edgeGauge, colour.accent                        | #703    |
| odometer      | money on a parchment drum, `type.odometer`, rolling under 0.6 s, the shared formatter's text, `data-exact` for the canonical value                                         | motion.odometer, numbers                               | #684    |
| chip          | icon plus one value in a pill (`radiusPx.chip`): the next-upgrade chip, a status chip                                                                                      | radiusPx.chip, type.label                              | #684    |
| status icon   | a 16 px triangle-framed icon (#158) in the strip's priority row, 3 on phone and 6 on desktop; a cooldown or count as a ring, no text                                       | layout.statusIcons                                     | #685    |
| edge glow     | an inset glow along all four screen edges in a ladder tier's colour, pulsing; carries no box and no text                                                                   | warningLadder.glow, motion.glowPulseMs                 | #685    |
| toast         | one line of 6 words or fewer, 2 s or less, ledger voice, never during a cut; queued behind the hint chip's rule (#500)                                                     | copy.toastWordsMax, motion.toastMaxMs                  | #685    |
| sheet         | the full-screen (phone) or docked (desktop) panel: a brass shutter opens it over `sheet` ms, one tab bar of data-driven tabs (at most 8 before scrolling), one scroll area | motion.durationsMs.sheet, layout.tabsMax, panelOpacity | #686    |
| tab           | a brass-edged label in the sheet's tab bar, `type.label`, the active one lifted                                                                                            | framePx.hairline, type.label                           | #686    |
| card          | a title (3 words) plus one line (12 words) in a card frame; on a phone the first tap reveals the line, the second acts (`ui.reveal`)                                       | copy, radiusPx.card, framePx.double                    | #686    |
| scroll area   | the one steampunk scroll area (`kit/ScrollArea.tsx`): brass rail, riveted thumb, edge fades                                                                                | materials.brass, motion.durationsMs                    | exists  |
| tooltip       | the brass plate (`kit/Tooltip.tsx`), hover 200 ms, focus, long-press; desktop's hover detail                                                                               | framePx.double, type.body                              | exists  |
| plaque, panel | `kit/Plaque.tsx`, `kit/Panel.tsx`: riveted double frame and the plain panel; keep their look, take the tokens                                                              | framePx, radiusPx.panel                                | exists  |
| tool slot     | a 44/48 px cell: icon and a cooldown ring (`cooldownRingPx`), never text; a charges count past one; number-key hotkeys on desktop                                          | layout.toolSlots, colour.accent                        | #691    |
| overflow tray | the cell after the slots (phone and desktop): turns the cells to the rest of the owned tools, a page at a time, and back                                                   | layout.toolSlots                                       | #691    |
| gear button   | the one control that opens the strip's detail (exact values, words); in the thumb zone, never the top keep-out                                                             | layout.tapTargetMinPx                                  | #684    |
| hint chip     | #500's chip, unchanged: one line, 8% of height at most, queued when the clear view would fall                                                                              | existing constants                                     | exists  |

**The sheet as built (#686).** One base sheet (`ui/sheet/BaseSheet.tsx`) draws the store's open
tab (`openSheet(tabId)`, `closeSheet()`, Escape) in the kit frame (`kit/Sheet.tsx`). Its tabs are
data: a slice registers a `sheetTab` (`ui/registries/sheetTabs.ts`: id, a title of 3 words or
fewer, refused at the seal past `copy.titleWordsMax`, an order, `isShownOn(state)` and its
content), named from the vocabulary below where it has a place. On a phone (`sheetPlacementOf`) it
fills the stage and rises from the foot, its tab bar and Close at the foot in the thumb zone, so
nothing in the top keep-out takes a tap. On desktop it docks in a `layout.sheetDock.widthPx` (400)
column at the right and the stage narrows by it, as long as the view keeps
`layout.sheetDock.minViewPx` (640) beside it; a narrower desktop window takes the full sheet. A
lone tab hides the bar; past what fits, the bar scrolls sideways in the shared scroll area
(`axis="x"`). The card (`kit/SheetCard.tsx`) is one 44 px button: the title (`type.title`), an
optional icon and figure, and the line (`type.body`) folded until a finger's first tap reveals it
(`ui.reveal`, one card at a time), a resting mouse hovers it or the keyboard focuses it; the
second tap, a click or Enter acts (`cardReveal.ts`). Under Reduce Motion the shutter fades and the
fold snaps. The tab, card and sheet frames take the #683 art through `--art-tab-frame*`,
`--art-card-frame` and `--art-sheet-frame`, with the CSS frames behind them.

**The Outfitter and the Patent Office as built (#687).** Both are tabs on the base sheet, each a
list of cards: a title, one line of gain text and the price as the figure, greyed (`isMuted`)
while the wallet is short. Gain text is `systems/views/gainText.ts`: the stat and its change as a
share read in decimal and rounded toward zero ("+24% drill speed", "-12% cooldown"), never a
before-and-after table. The **Outfitter** (`workshop.outfitter`, order 10) is the Upgrade bay
(`systems/views/outfitterCards.ts`): the six tracks, Casing, lining, guns, charges and rack, the
researched items, the slices' bay entries and Repair, each card the bay's own button
(`kit/MenuSheetCard.tsx`, its `data-testid` the #33 buy id). Docking at the bay opens the sheet on
it and undocking shuts it; the bay's slim frame (header, footer, an Outfitter button) stays under
it, so on a phone Close shows the car and the way out, and on desktop the car stays in view beside
the docked sheet. A sheet open over a docked bay walks and confirms that bay's menu, so the pad's
d-pad lights a card (`data-focused`) and A buys it. The **Patent Office**
(`tech-tree.patent-office`, order 20) is the tech tree (`patentCards.ts`): one card per node in
the order the wallet reaches it; a researched item's card offers its next Mark with that Mark's
gain ("Mk II: -10% cooldown") or milestone verb, a locked one says why. The HUD's tree button
opens it. The lane map, its pan and pinch, the node sheet and the plaques around the car are gone.

**Cargo and saves on the sheet (#688).** The kernel's own tabs, the **Hold** and the **Ledger**, sit
on the bar everywhere (`KERNEL_SHEET_TABS`, after the Outfitter and the Patent Office). The Hold is
the Sell bay's ore panel as was: one Sell card per held tier (the tier's ore icon, `Tier N ore`,
the line value as its figure, "12 held, 4.5k each." as its line) and Sell all. Each card carries
the authority's refusal of its sale, so it is greyed away from the Sell bay and acts only docked
there; the pad and the keys step over the cards as menu focus, marked by the screen buttons'
double frame. The Sell bay keeps Quick service, Refined, Lining and Charging, and one Hold row whose
Open opens the Hold. The Ledger is the pause menu's save page as was (#672 copy, #703 slot line,
#704 Scrap), drawn in the sheet's one scroll area: Save game opens it and the pause plate gives
way, the world stays held, the pause menu's focus stops and Escape still drive it, its Close steps
back to the pause menu's first page, and picking another tab leaves the pause menu. The title
menu's Load page is unchanged.

## 11. Copy

**Vocabulary** (Progression, GD lock): the places are the **Outfitter** (the upgrade bay's sheet,
#687), the **Patent Office** (the tech tree, #687), the **Hold** (cargo, #688), the **Ledger**
(saves, #688 and the #672 strings) and the **Gearbox** (the loadout, where an item is fitted into
a slot). One verb per action, always the same word: **Buy** (an upgrade, a patent, an item), **Fit**
(an owned item into a slot), **Sell** (cargo), **Scrap** (a save, an item given up), **Travel** (to
the next planet). No synonyms: never "purchase", "equip", "delete", "launch".

**The engineer's ledger voice.** Entries, not sentences: a noun first, a figure, a past participle
for what happened ("Sold 12 ore. +1.2k", "Hull patched", "Fuel low"). Present imperative only on a
control (Buy, Fit). No "you", no exclamation marks, no "click", "hover" or "mouse" (#470 copy
rule; `{inputVerb}` for a device hint). Figures from the formatter's placeholders (`{moneyShort}`),
never typed. Gain text names the stat and the change ("+24% drill speed"), never a table (#687).

**Budgets** (`copy`): titles of **3 words or fewer** (down from #422's 4; #680 lowers
`TITLE_WORDS_MAX`), hover lines of **12 words or fewer**, toasts of **6 words or fewer for at most
2 s**. Prices are numbers only. Levels have no MAX state: a level that cannot rise shows its number
and a greyed Buy, never the word MAX (VS).

## 12. Numbers

One formatter for money, prices and income (#681, the GD ruling of 21 Oct 18:33 on #678 conflict
(a): the VS format): typed Money in, a string out, never through a float. Values show whole up to
`numbers.wholeBelow` (9,999), then **3 significant figures** with the suffixes **k through Dc**
(1e3 to 1e33), then e-notation; **at most 6 characters** plus the currency glyph, so 1e15 fits the
strip at 360 px and 1e300 prints (`1e300`). Prices round **up** and balances **down**, so
"affordable" is never wrong. Never NaN, Infinity or a MAX state. Depth is metres up to 9,999, then
km with 1 decimal (`numbers.depthKmFromMetres`); speed is m/s at 3 significant figures, shown on
desktop detail only. Raw cells/s and hardness stay debug-only.

Gauges on the strip are **fraction-only**: hull, fuel, cargo and heat show a fill, never a number
(Systems); the exact values sit behind the gear button, `data-exact` carrying the canonical string
as today. The odometer is the only rolling number.

## 13. Art brief: Blender gauges and frames (#683)

Flat sprites, not models: each asset is a `parts` bake (docs/art-pipeline.md, "UI chrome
sprites") shipped **at 1x and 2x** CSS px as PNG for the DOM (`image-set()`, `border-image`),
beside the KTX2 atlas the WebGL layers may use. The `ui-` category derives its ids from the
`art.*` tokens (`systems/art/uiArt.ts`); the files live under `public/assets/ui/<id>/`. A sprite is
authored at **one Blender unit per CSS px** and baked at 4 atlas px per CSS px, then box-filtered
to its two PNGs, so every edge is anti-aliased. Every frame is a **nine-slice** whose insets
(`insetPx`, one value per axis) the sidecar carries, so one bake fits every size; a frame is
hollow, and the CSS behind it sets the body colour, so a translucent panel stays translucent.
Colour is the three material stops of section 3 baked in (highlight up on a bezel, upside down in a
well); a part with accent areas is `tintable` and ships a separate **tint mask** (alpha), so a
planet skin colours those areas in CSS and the brass stays brass. Readable at 360 px means every
stroke is at least 1 px at 1x; the review sheets are in `docs/art/ui-chrome/`.

| Token            | Asset id           | Parts and 1x size (px)                                                      | Insets, tint                |
| ---------------- | ------------------ | --------------------------------------------------------------------------- | --------------------------- |
| art.gaugeBar     | `ui-gauge-bar`     | 96 x 16: iron well in a 2 px brass bezel; fill is CSS                       | 6 x 6                       |
| art.gaugeDial    | `ui-gauge-dial`    | 64 x 64: brass rim, face, 240-degree ticks, hub                             | face tintable (`dialFace`)  |
| art.gaugeNeedle  | `ui-gauge-needle`  | 4 x 28: tapered brass pointer, origin at its foot, where it turns (#716)    |                             |
| art.edgeGauge    | `ui-edge-gauge`    | 8 x 64: vertical trough, brass rails and caps; mark CSS                     | 0 x 8                       |
| art.odometerDrum | `ui-odometer-drum` | 16 x 240: ten parchment digits, 24 px cells, 0 on top                       |                             |
| art.sheetFrame   | `ui-frame-sheet`   | 128 x 128: double brass frame, iron band, 4 rivets                          | 24 x 24                     |
| art.cardFrame    | `ui-frame-card`    | 96 x 64: single bezel over a hairline, corner studs                         | 12 x 12                     |
| art.glassFrame   | `ui-frame-glass`   | 48 x 48: 3 px brass bezel, dark lip, glass glint, corner studs (#716)       | 10 x 10                     |
| art.tabFrame     | `ui-frame-tab`     | 64 x 32 `ui-frame-tab` and `-active`: brass top edge, 1 px sides, open foot | 8 x 8; active edge tintable |
| art.scrollRail   | `ui-scroll-rail`   | 8 x 64 `ui-scroll-rail` and 12 x 24 `-thumb` (riveted)                      | 0 x 8 each                  |
| art.slotRing     | `ui-slot-ring`     | 48 x 48: brass ring over an iron well; cooldown is a CSS mask               | inner ring tintable         |
| art.statusPlate  | `ui-status-plate`  | 24 x 24: the triangle plate behind a status icon (#158)                     |                             |
| art.gearButton   | `ui-gear-button`   | 48 x 48 `ui-gear-button` and `-pressed`: gear on a riveted plate            | hub lamp tintable           |

**Drawing one.** `kit/UiArtTokens.tsx` writes one `:root` rule from the shipped catalogue: for a
token `gaugeBar`, `--art-gauge-bar` is the `image-set()` of its two files, `--art-gauge-bar-size`
its 1x size, and on a nine-slice `--art-gauge-bar-slice` and `--art-gauge-bar-width` are the
`border-image` slice percentages and width; a variant adds its suffix (`--art-tab-frame-active`),
a tintable part `-tint`. So a frame is
`border-image: var(--art-sheet-frame) var(--art-sheet-frame-slice) fill / var(--art-sheet-frame-width)`,
and a skin colour shows through `mask: var(--art-gauge-dial-tint)` over a `background` of the
skinnable token. A token whose asset is a placeholder writes no variable, and the CSS frame behind
`var()` stays, so nothing waits on art. The kit dial and scroll area draw theirs; the strip (#684),
status icons (#685), sheet, tabs and cards (#686) and tool slots (#691) take the rest.

Each bakes with the existing export (`npm run art:export -- <id>`): one mesh per sprite, origin at
the sprite's centre, orthographic along +Y, Cycles 1 sample seed 0; the `.blend` under
`art/blender/<id>/`, written first by `scripts/art/author_ui_chrome.py`, its manifest entry
`art/assets/<id>.json`, the sprite table (`uiSprites`) in `art/asset-rules.json`, one spec per
module (`systems/art/uiArt.test.ts`).

## 14. Reuse by data

- **A new planet** adds one entry to `planetSkins` under its palette id (the same ids as
  `artDirection.json`'s `palettes`), naming any of the `skinnable` colours. `skinProblemsOf`
  refuses anything else, so a skin can never move a limit.
- **A new module (slice)** fits an existing **kind** (HS): a tool slot row (an icon, a cooldown, a
  press path), a status icon with a priority, a tab on the base sheet, a card on a tab, a sound
  cue under its own prefix, a toast. It registers through the registries as today; the layout
  reserves the space by kind, so a new tool adds a row, not a layout change (#691). A new kind
  (a fourth bar, a second strip, a number on the strip) needs a ticket and Bjor's sign-off.
- **A new readout** that is bounded joins the ladder as it is; one that grows without bound is a
  Money and goes through the formatter.
- **A new cue** joins `soundCues` with its voices and family; a family outside section 8 is a
  design change, not data.

## 15. Rule map: the GD lock as tokens and limits

| Rule on the map (GD lock, 21 Oct)                                            | Token or limit                                                       | Built by   |
| ---------------------------------------------------------------------------- | -------------------------------------------------------------------- | ---------- |
| HUD at most 12% of a phone screen, 8% on desktop                             | `layout.coverageMaxPercent`; worked budget in section 9              | #682, #689 |
| nothing in the drill-head middle band or below the rig                       | `layout.middleBand`, `isOutsideMiddleBand`; dynamic never-cover rule | #682, #689 |
| strip: hull, fuel, cargo bars; heat only above 60%                           | `layout.strip`, `gaugeFills`, `heatShowsAbovePercent`                | #684       |
| depth the only always-on number; money on the surface plus a float-up        | `motion.floatUpMs`, section 9 strip rule                             | #684       |
| next-upgrade chip on the surface, icon plus price, no label; no speed        | chip component, section 9                                            | #684       |
| compact formatter: 3 significant figures, 6 characters, k to Dc, e-notation  | `numbers`                                                            | #681       |
| prices round up, balances down; no NaN, Infinity or MAX                      | section 12                                                           | #681       |
| odometer rolls in 0.6 s or less; fraction-only gauges                        | `motion.odometer.rollMaxMs`; section 12                              | #684       |
| titles of 3 words, hover lines of 12, toasts of 6 words for at most 2 s      | `copy`, `motion.toastMaxMs`                                          | #680, #685 |
| tap targets at least 44 px, text at least 14 px                              | `layout.tapTargetMinPx`, `type.minPx`                                | #682, #689 |
| nothing interactive in the top 15% on a phone; controls in the thumb zone    | `layout.topKeepOutPercent`, `layout.thumbZoneHeightPercent`          | #684, #691 |
| warnings are edge glows plus an icon and a sound, never text boxes           | `warningLadder.glow`, `soundCues.ui.warn.*`                          | #685       |
| warning ladder at 30%, 15% and 0%, each tier once on the way in; haptics     | `warningLadder.tiers`, `rearmPercent`, `hapticMs`                    | #685       |
| needle ease 150 to 250 ms with overshoot, never more than 300 ms behind      | `motion.needle`                                                      | #684       |
| motion 200 ms or less; Reduce Motion                                         | `motion.transitionMaxMs`, `motion.reduceMotion`                      | #682, #686 |
| materials, sound and token list; planets re-skin through tokens only         | sections 3, 8; `skinnable`, `planetSkins`                            | #682, #683 |
| vocabulary: Outfitter, Patent Office, Hold, Ledger, Gearbox; one verb each   | `copy.places`, `copy.verbs`                                          | #680, #686 |
| mockups at 360x640 and 1440x900; desktop first-class                         | `layout.mockups`, section 9                                          | #689       |
| 4 thumb slots plus overflow on phone; hotkeys and up to 8 on desktop         | `layout.toolSlots`                                                   | #691       |
| status icons 3 on phone and 6 on desktop, in priority order                  | `layout.statusIcons`                                                 | #685       |
| one tabbed base panel, about 8 tabs from data; desktop docks beside the view | `layout.tabsMax`; sheet component                                    | #686       |
| a new feature fits an existing kind; a new kind needs a ticket and sign-off  | section 14                                                           | all        |
| no economy change                                                            | nothing here reaches a rule, a price or a digest                     | all        |

## 16. Token reference

Generated from `designTokens.json`; a row is the token's path and its value. The spec
`designSystemDoc.test.ts` checks every token has its row here with the same value.

### colour

| Token               | Value   |
| ------------------- | ------- |
| `colour.bg`         | #1b1613 |
| `colour.panel`      | #1b1613 |
| `colour.text`       | #f3ead8 |
| `colour.parchment`  | #e9dcc0 |
| `colour.brass`      | #c9a24b |
| `colour.copper`     | #b87333 |
| `colour.amber`      | #e0a040 |
| `colour.teal`       | #3fa7a0 |
| `colour.verdigris`  | #4fa8a0 |
| `colour.ember`      | #e0602a |
| `colour.iron`       | #3a3632 |
| `colour.steel`      | #8a94a0 |
| `colour.danger`     | #c8382a |
| `colour.accent`     | #c9a24b |
| `colour.accentSoft` | #e0a040 |
| `colour.glow`       | #e0a040 |
| `colour.dialFace`   | #e9dcc0 |
| `panelOpacity`      | 0.85    |

### materials and gauge fills

| Token                           | Value     |
| ------------------------------- | --------- |
| `materials.brass.highlight`     | #efd27a   |
| `materials.brass.base`          | #c9a24b   |
| `materials.brass.shadow`        | #6e5220   |
| `materials.copper.highlight`    | #e0995c   |
| `materials.copper.base`         | #b87333   |
| `materials.copper.shadow`       | #5e3414   |
| `materials.iron.highlight`      | #5c5650   |
| `materials.iron.base`           | #3a3632   |
| `materials.iron.shadow`         | #17140f   |
| `materials.steel.highlight`     | #b8c0c8   |
| `materials.steel.base`          | #8a94a0   |
| `materials.steel.shadow`        | #454c54   |
| `materials.parchment.highlight` | #f6efdc   |
| `materials.parchment.base`      | #e9dcc0   |
| `materials.parchment.shadow`    | #b9a888   |
| `glassSheenOpacity`             | 0.08      |
| `gaugeFills.hull`               | copper    |
| `gaugeFills.fuel`               | amber     |
| `gaugeFills.cargo`              | verdigris |
| `gaugeFills.heat`               | ember     |

### type, spacing, radius and frames

| Token                   | Value                                              |
| ----------------------- | -------------------------------------------------- |
| `type.fontBody`         | 'Georgia', 'Times New Roman', serif                |
| `type.fontNumerals`     | ui-monospace, 'Cascadia Mono', Consolas, monospace |
| `type.minPx`            | 14                                                 |
| `type.sizesPx.label`    | 14                                                 |
| `type.sizesPx.body`     | 16                                                 |
| `type.sizesPx.odometer` | 18                                                 |
| `type.sizesPx.title`    | 20                                                 |
| `type.sizesPx.display`  | 24                                                 |
| `type.lineHeight`       | 1.3                                                |
| `type.labelTrackingEm`  | 0.08                                               |
| `spacePx.1`             | 4                                                  |
| `spacePx.2`             | 8                                                  |
| `spacePx.3`             | 16                                                 |
| `spacePx.4`             | 24                                                 |
| `spacePx.5`             | 32                                                 |
| `radiusPx.panel`        | 6                                                  |
| `radiusPx.card`         | 4                                                  |
| `radiusPx.chip`         | 12                                                 |
| `framePx.hairline`      | 1                                                  |
| `framePx.bezel`         | 2                                                  |
| `framePx.double`        | 3                                                  |
| `framePx.rivet`         | 3                                                  |

### motion

| Token                            | Value                             |
| -------------------------------- | --------------------------------- |
| `motion.transitionMaxMs`         | 200                               |
| `motion.durationsMs.instant`     | 80                                |
| `motion.durationsMs.quick`       | 120                               |
| `motion.durationsMs.standard`    | 160                               |
| `motion.durationsMs.sheet`       | 200                               |
| `motion.easing.enter`            | cubic-bezier(0.2, 0.8, 0.2, 1)    |
| `motion.easing.exit`             | cubic-bezier(0.4, 0, 1, 1)        |
| `motion.easing.needle`           | cubic-bezier(0.34, 1.56, 0.64, 1) |
| `motion.needle.easeMinMs`        | 150                               |
| `motion.needle.easeMaxMs`        | 250                               |
| `motion.needle.overshootShare`   | 0.06                              |
| `motion.needle.lagMaxMs`         | 300                               |
| `motion.odometer.rollMaxMs`      | 600                               |
| `motion.odometer.digitMs`        | 120                               |
| `motion.floatUpMs`               | 600                               |
| `motion.glowPulseMs`             | 1000                              |
| `motion.toastMaxMs`              | 2000                              |
| `motion.reduceMotion.transition` | fade                              |
| `motion.reduceMotion.needle`     | snap                              |
| `motion.reduceMotion.odometer`   | set                               |
| `motion.reduceMotion.floatUp`    | fade                              |
| `motion.reduceMotion.glow`       | steady                            |

### warning ladder and haptics

| Token                                    | Value                                     |
| ---------------------------------------- | ----------------------------------------- |
| `warningLadder.tiers.low`                | atPercent 30 · colour amber · hapticMs 10 |
| `warningLadder.tiers.critical`           | atPercent 15 · colour ember · hapticMs 30 |
| `warningLadder.tiers.empty`              | atPercent 0 · colour danger · hapticMs 60 |
| `warningLadder.rearmPercent`             | 5                                         |
| `warningLadder.glow.thicknessPx.phone`   | 24                                        |
| `warningLadder.glow.thicknessPx.desktop` | 32                                        |
| `warningLadder.glow.opacity`             | 0.6                                       |
| `haptics.tapMs`                          | 10                                        |
| `haptics.longPressMs`                    | 10                                        |
| `haptics.setting`                        | haptics                                   |

### sound cues

| Cue                          | Voices · family · rings · when                                             |
| ---------------------------- | -------------------------------------------------------------------------- |
| `soundCues.ui.tap`           | voices 2 · family click · maxMs 80 · when a control is pressed             |
| `soundCues.ui.tab`           | voices 1 · family ratchet · maxMs 120 · when a tab is chosen               |
| `soundCues.ui.reveal`        | voices 1 · family click · maxMs 80 · when a first tap shows a card's line  |
| `soundCues.ui.sheet.open`    | voices 1 · family shutter · maxMs 200 · when a sheet slides in             |
| `soundCues.ui.sheet.close`   | voices 1 · family shutter · maxMs 200 · when a sheet slides out            |
| `soundCues.ui.buy`           | voices 2 · family ratchet · maxMs 300 · when Buy succeeds                  |
| `soundCues.ui.fit`           | voices 1 · family clank · maxMs 200 · when Fit seats an item               |
| `soundCues.ui.sell`          | voices 2 · family chime · maxMs 400 · when Sell pays out                   |
| `soundCues.ui.scrap`         | voices 1 · family clank · maxMs 300 · when Scrap is confirmed              |
| `soundCues.ui.travel`        | voices 1 · family whistle · maxMs 600 · when Travel starts                 |
| `soundCues.ui.refuse`        | voices 1 · family clank · maxMs 200 · when a command is refused            |
| `soundCues.ui.warn.low`      | voices 1 · family bell · maxMs 400 · when a gauge hits 30%                 |
| `soundCues.ui.warn.critical` | voices 1 · family bell · maxMs 400 · when a gauge hits 15%                 |
| `soundCues.ui.warn.empty`    | voices 1 · family bell · maxMs 600 · when a gauge hits 0%                  |
| `soundCues.ui.odometer`      | voices 1 · family tick · maxMs 600 · when the money odometer rolls         |
| `soundCues.ui.toast`         | voices 1 · family chime · maxMs 200 · when a toast shows                   |
| `soundCues.ui.slot.ready`    | voices 1 · family tick · maxMs 120 · when a slot's cooldown ring completes |

### layout

| Token                                                 | Value                   |
| ----------------------------------------------------- | ----------------------- |
| `layout.breakpoints.phone.coarseShortAxisBelowPx`     | 800                     |
| `layout.breakpoints.phone.anyPointerShortAxisBelowPx` | 500                     |
| `layout.tapTargetMinPx`                               | 44                      |
| `layout.coarseTargetPx`                               | 56                      |
| `layout.topKeepOutPercent`                            | 15                      |
| `layout.thumbZoneHeightPercent`                       | 45                      |
| `layout.stickZoneWidthPercent`                        | 40                      |
| `layout.middleBand.topPercent`                        | 30                      |
| `layout.middleBand.bottomPercent`                     | 70                      |
| `layout.edgeLanePx`                                   | 8                       |
| `layout.marginPx`                                     | 8                       |
| `layout.strip.heightPx.phone`                         | 36                      |
| `layout.strip.heightPx.desktop`                       | 44                      |
| `layout.strip.maxWidthPx.phone`                       | 600                     |
| `layout.strip.maxWidthPx.desktop`                     | 720                     |
| `layout.strip.barHeightPx`                            | 8                       |
| `layout.strip.heatShowsAbovePercent`                  | 60                      |
| `layout.edgeGauge.widthPx`                            | 4                       |
| `layout.edgeGauge.slotLengthPx`                       | 24                      |
| `layout.statusIcons.count.phone`                      | 3                       |
| `layout.statusIcons.count.desktop`                    | 6                       |
| `layout.statusIcons.sizePx`                           | 16                      |
| `layout.toolSlots.count.phone`                        | 4                       |
| `layout.toolSlots.count.desktop`                      | 8                       |
| `layout.toolSlots.overflow.phone`                     | true                    |
| `layout.toolSlots.overflow.desktop`                   | true                    |
| `layout.toolSlots.columns.phonePortrait`              | 3                       |
| `layout.toolSlots.columns.phoneLandscape`             | 6                       |
| `layout.toolSlots.columns.desktop`                    | 10                      |
| `layout.toolSlots.cellPx.phone`                       | 44                      |
| `layout.toolSlots.cellPx.desktop`                     | 48                      |
| `layout.toolSlots.gapPx`                              | 4                       |
| `layout.toolSlots.cooldownRingPx`                     | 3                       |
| `layout.tabsMax`                                      | 8                       |
| `layout.sheetDock.widthPx`                            | 400                     |
| `layout.sheetDock.minViewPx`                          | 640                     |
| `layout.coverageMaxPercent.phone`                     | 12                      |
| `layout.coverageMaxPercent.desktop`                   | 8                       |
| `layout.mockups.phone`                                | width 360 · height 640  |
| `layout.mockups.desktop`                              | width 1440 · height 900 |

### copy and numbers

| Token                             | Value                                  |
| --------------------------------- | -------------------------------------- |
| `copy.titleWordsMax`              | 3                                      |
| `copy.hoverWordsMax`              | 12                                     |
| `copy.toastWordsMax`              | 6                                      |
| `copy.verbs`                      | Buy, Fit, Sell, Scrap, Travel          |
| `copy.places.outfitter`           | Outfitter                              |
| `copy.places.patentOffice`        | Patent Office                          |
| `copy.places.hold`                | Hold                                   |
| `copy.places.ledger`              | Ledger                                 |
| `copy.places.gearbox`             | Gearbox                                |
| `numbers.significantFigures`      | 3                                      |
| `numbers.maxChars`                | 6                                      |
| `numbers.wholeBelow`              | 10000                                  |
| `numbers.suffixes`                | k, M, B, T, Qa, Qi, Sx, Sp, Oc, No, Dc |
| `numbers.depthKmFromMetres`       | 10000                                  |
| `numbers.depthKmDecimals`         | 1                                      |
| `numbers.speedSignificantFigures` | 3                                      |

### art and planet skins

| Token                                     | Value                              |
| ----------------------------------------- | ---------------------------------- |
| `art.gaugeBar`                            | ui-gauge-bar                       |
| `art.gaugeDial`                           | ui-gauge-dial                      |
| `art.gaugeNeedle`                         | ui-gauge-needle                    |
| `art.edgeGauge`                           | ui-edge-gauge                      |
| `art.odometerDrum`                        | ui-odometer-drum                   |
| `art.sheetFrame`                          | ui-frame-sheet                     |
| `art.cardFrame`                           | ui-frame-card                      |
| `art.glassFrame`                          | ui-frame-glass                     |
| `art.tabFrame`                            | ui-frame-tab                       |
| `art.scrollRail`                          | ui-scroll-rail                     |
| `art.slotRing`                            | ui-slot-ring                       |
| `art.statusPlate`                         | ui-status-plate                    |
| `art.gearButton`                          | ui-gear-button                     |
| `skinnable`                               | accent, accentSoft, glow, dialFace |
| `planetSkins.palette.planet_1.accent`     | #c9a24b                            |
| `planetSkins.palette.planet_1.accentSoft` | #e0a040                            |
| `planetSkins.palette.planet_1.glow`       | #e0a040                            |
| `planetSkins.palette.planet_2.accent`     | #8a7aa8                            |
| `planetSkins.palette.planet_2.accentSoft` | #b9a8d8                            |
| `planetSkins.palette.planet_2.glow`       | #9a86c8                            |
| `planetSkins.palette.heat.accent`         | #c4532e                            |
| `planetSkins.palette.heat.accentSoft`     | #ff8a2a                            |
| `planetSkins.palette.heat.glow`           | #ff8a2a                            |
