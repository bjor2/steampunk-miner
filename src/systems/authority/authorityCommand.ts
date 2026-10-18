/**
 * Authority commands (decision #3): intents, sent as `{ playerId, tick, seq, type, payload }` and
 * replayed from `commands.ndjson`, so every field is plain JSON (money as decimal strings).
 * Commands are ordered by `(tick, seq)`; `tick` is the fixed 1/60 s step, never wall-clock.
 *
 * Debug and scenario commands are the `debug.*` types (#11 section 4); `isDebugCommandType`
 * marks them instead of a separate flag that could disagree with the type.
 */

import type { BayId } from '../world/dockBays'
import type { DriveSigns } from '../vehicle/driveSigns'

/**
 * Bump when a command or domain event changes shape or meaning; run metadata records it.
 * 2: `Dock {bay}` and the two bays of #37, with the run starting in the Sell bay.
 * 3: the vehicle's casing grade and `BuyCasingGrade` (#41, #58).
 * 4: the artefact commands and events (#46).
 * 5: the casing layer in chunk deltas, its events and debug commands (#41, #56).
 * 6: collapse (#43, #57): its events, `debug.forceCollapse` and `VehicleDamaged.source`.
 * 7: the first-place lining charge (#76, #85): drilling now debits the wallet, `CasingLined`.
 * 8: breached casing and the tunnel wrecker (#111, #94): casing 255 in chunk deltas,
 *    `CasingBreached`, `RingGnawed`, the wrecker's events and `debug.gnawCasing`.
 * 9: `auto_guns` (#93, #107): the vehicle's gun, `BuyGun`, `SetGunMode`, `debug.setGunLevel`, gun
 *    shots on the clock, `GunHit` and `EnemyKilled {by: gun}`.
 * 10: the Refinery bay (#105, #92): `Dock {bay: refinery}`, its commands, slots and events.
 * 11: scripted mining (`drillTile`) lays and charges casing as a pose's drilling does, lining is
 *    charged per metre of tunnel axis, not per ring, and onto the vehicle's lining bill, settled
 *    out of the next sale as `LiningSettled` instead of debited mid-dive (#115, #76 amendment).
 * 12: the bill is settled per Sell bay visit (#128): each payout, collected Refinery batches too,
 *    logs what it paid as `LiningSettled`, and undocking logs what the visit forgave.
 * 13: blasting charges (#109, #95): the rack and charge commands, their events,
 *    `debug.setCharges`, and blast sources on `VehicleDamaged` and the enemy events.
 * 14: heat, lava and the refractory lining (#113, #96): lining types in the casing layer and on the
 *    vehicle, `BuyLiningType`, `SelectLiningType`, `debug.setLiningType`, `CasingLined.liningType`;
 *    the heat gauge, its throttle and damage, `HeatThreshold`, `Overheat*`, `debug.setHeat`.
 * 15: drill_power and drill_tip prices flattened to ratio 1.225 and 1.500625 on bases 55 and 83
 *    (#84, #77), so the same `BuyUpgrade` costs a different amount.
 * 16: `CargoAdded` names its ore (#122): `oreId` (#155), the cell's `depthTiles` and `chunk`; a
 *    blast's kept units are the first ore cells of their tier it broke.
 * 17: the vehicle's loadout (K4, #162): `equipItem`, `debug.setVehicleLoadout`, `ItemEquipped`
 *    and `EquipRefused`.
 * 18: the sliced live blast and the shared terrain-edit queue (K6, #189): a charge's ground breaks
 *    64 tiles a tick after it blows, `ChargeDetonated` keeps only its tile, `BlastFront` and
 *    `BlastResolved` join, a blast's `TileDestroyed` carries `cause: 'blast'`, and power-up
 *    terrain edits apply from the queue.
 * 19: `QuickService` works at the Workshop (`upgrade`) as well as at Sell, and is refused
 *    `wrong_bay` at the Refinery only (#170, #175).
 * 20: the brass tracks and casing grades flattened to drill power's ratio 1.225 on bases 24, 23,
 *    36, 46 and 48 (#195), so the same `BuyUpgrade` and `BuyCasingGrade` cost a different amount.
 * 21: `ChargeDetonated` carries its blast's ladder `size` and `radiusMm` (#213).
 * 22: the tech tree slice (#165): `tech-tree.unlock_node` and `debug.tech-tree.unlockThrough`,
 *    answered by `tech-tree.TechNodeUnlocked`, `tech-tree.TechNodeRefused` and
 *    `tech-tree.TechNodesGranted`; its `tech-tree` player section v1.
 * 23: `ResourceSold` carries `coinsShown`, the sell burst's coin count from the sale's gross value
 *    against the cheapest next Workshop level (ticket 220, TD lock on #176).
 * 24: the codex slice (#207): its authority reaction answers `codex.OreContacted`,
 *    `codex.OreDiscovered` and `codex.EntryAdded` beside the touch or unit that caused them; its
 *    `codex` player section v1.
 * 25: travel logs `FeatureUnlocked` for the dock add-on facilities `scanner_station` (P14),
 *    `research_lab` (P15) and `drone_bay` (P20), now built and shipped (#221, #222).
 * 26: `CargoAdded` may name the ore's catalogue `family` and whether it is a `signature` ore
 *    (#223, for #146 and #141); the kernel default names neither, so its answers are unchanged.
 * 27: two-tier levels (#180 sections 3 and 4, #181): a track and the guns store a step `10L + k`,
 *    `BuyUpgrade` buys one step at its chain price, `BuyGun` mounts at step 10 and then buys steps,
 *    `debug.setUpgrade` and `debug.setGunLevel` take steps, `UpgradePurchased` holds steps in
 *    `fromLevel`/`toLevel` and adds `fromMajor`, `toMajor` and `isMajor`, stats follow the pips,
 *    the drill gates read the tip of the last completed major and the visual tier counts majors.
 * 28: hold-to-buy chains (#180 section 2, ticket 226): `BuyUpgrade`, `BuyGun`, `BuyChargeRackSlot`
 *    and `BuyCasingGrade` carry `chain` (0 a click, else the hold's id), a held step under the
 *    service reserve is refused `service_reserve`, and their purchase events carry the chain and,
 *    for a held step, `reserveLeft`; `CommandRejected` names the chain of a refused held step.
 * 29: the ores slice's catalogue names every ore (#146): `CargoAdded.oreId` is `<family>_t<tier>`
 *    with its `family` and `signature`, and lead cells carry tiers up to two above their band.
 * 30: the power-up core slice (#200): `power-up-core.use_power_up` and its clock step, the free
 *    dock refill, its `power-up-core` player section v1 and the three `slot.powerup_*` cradles.
 * 31: dynamite sizes (K8 #218): `plantCharge {size}` and `restockCharges {size, count}`,
 *    `debug.setCharges` names its size, `size_locked` and `no_charge_of_size` replace
 *    `no_charges`, `ChargePlanted` and `ChargesRestocked` carry the size, `ChargeDetonated` its
 *    trigger `by`, and `ChargeDisarmed` joins.
 * 32: the dynamite slice (#149): the plunger `dynamite.detonate_charge {}` with its rejections
 *    `dynamite.detonator_locked` and `dynamite.no_live_charge`, and `dynamite.DetonateRefused`.
 * 33: the planet-mix slice (#147): from planet 3 `CargoAdded` names the planet mix's families, a
 *    signature unit carries `signature: true` and is held and sold one tier up (#232 `saleTier`).
 * 34: the mobility lane (#204): `power-up-core.PowerUpRefused` for a use with nothing to act on,
 *    `mobility.GrappleHooked`, `mobility.HullPatched` and `mobility.PatchCancelled`, its
 *    `mobility` player section v1, and the four Schedule C rows it ships logged as unlocked.
 * 35: the mining-gates slice (ticket 236): from planet 7 lead cells and signatures carry #142's
 *    gates (dense cells, extractor gates, dynamite shells), `DrillGated` may be `blocked`, power-up
 *    terrain edits leave gated cells standing, and `mining-gates.GateCleared` and
 *    `mining-gates.GateOreLost` join.
 * 36: the store's buy path (ticket 248): `buyVehicleItem {itemId}` at the Upgrade bay, answered by
 *    `VehicleItemPurchased`, with the rejections `unknown_vehicle_item`, `vehicle_item_owned`,
 *    `not_researched` and `not_for_sale`.
 * 37: the drill-gear lane (#205): `power-up-core.use_power_up` also takes `drill.flank` and
 *    `drill.collar`, `drill-gear.GroundCrumbled`, `drill-gear.TunnelBackfilled` and
 *    `drill-gear.OreSampled`, its terrain edits and drill gear asks, and `side_drills` logged as
 *    unlocked.
 * 38: the extraction slice (#201): the mineral drain acts, `extraction.DrainYielded` joins, and
 *    the `extraction` player section v1 keeps the income items' trip counter.
 * 39: the kernel's `OreSampled {playerId, tx, ty, oreId, via}` (#243): the sampling corer's plug
 *    replaces `drill-gear.OreSampled`, and the codex answers it with `codex.OreContacted` via the
 *    tool.
 * 40: the sibling-link Mark milestone (ticket 274): `power-up-core.toggle_link {itemId}` with the
 *    rejection `power-up-core.no_sibling_link`, `power-up-core.LinkToggled`, and
 *    `power-up-core.LinkFired` after an act whose Mark reached its link.
 * 41: `reportPose` carries `drive {x, y}`, the push as signs (TD lock on #279), refused unless each
 *    is -1, 0 or 1; drill gear aimed by the drive turns the twin bit's ahead cell from `drive.x`,
 *    latched per cell. With no gear registered no digest or mined order changes.
 * 42: hold and second tap (ticket 273, #256): `power-up-core.hold_power_up {slot}` with the
 *    rejections `no_milestone` and `nothing_to_hold`, and `PowerUpUsed` may name its `milestone`.
 * 43: the terrain-tools lane (#202): the ore-shifter, seam splitter, pressure pocket lance and
 *    lodestone beacon queue seeded K6 edits, `terrain-tools.TerrainEdited` and
 *    `terrain-tools.BeaconPlanted` join, and its `terrain-tools` player section v1.
 * 44: `hazard:magnetic` (ticket 290, spec #258): `MagneticFieldEntered {planetIndex}` and
 *    `ElectrifiedCellShocked {tx, ty, ticks, hullBp, withBit}` join, an electrified cell takes its
 *    shock's ticks longer to drill, and the vehicle may carry `shockHullBp`. Off the magnetic
 *    planets no digest or mined order changes.
 * 45: the bore gun (ticket 313, #309): `ground_gun.fire {bearing}` with the rejections
 *    `no_bore_gun`, `recovering` and `energy_short`, `BoreFired` and `BoreEnded`, bored cells'
 *    `TileDestroyed {cause: 'bore'}`, the pending bores in state with their `nextShotTick`, and
 *    their bore-disturbance collapse checks. With no shot fired no digest or mined order changes.
 * 46: the repulsor coil (ticket 284, #246): its push-wave acts through the kernel magnet shift and
 *    pushes metal enemies one cell out, and `terrain-tools.MagnetUsed` joins. With no magnet owned
 *    no digest or mined order changes.
 * 47: collapse braces (ticket 331, the TD ruling on #285): `CollapseBraced {block, by}` joins, a
 *    braced collapse entry carries `isBraced: true` and warns afresh for 60 ticks when its brace
 *    ends. With no brace registered no digest or mined order changes.
 * 48: the slot release (ticket 332, #285): `power-up-core.release_power_up {slot}`, an item's
 *    optional `release` hook and `power-up-core.PowerUpReleased`, and a release during the
 *    wind-up kept as the pending use's `releasedTick`. With no item declaring `release` no
 *    digest or mined order changes.
 * 49: auto mode (ticket 317, #310): `ground_gun.set_auto {on}`, refused `not_researched` without
 *    the steam sear, each player's items on auto with their hold and locked preview, the clock's
 *    auto acts, a manual shot's wait folded into its `nextShotTick` while auto is on, and
 *    `AutoModeSet`, `AutoTargetLocked`, `AutoActed` and `AutoActOverridden`. With auto off no
 *    digest or mined order changes.
 * 50: the swept cut (ticket 330, dev flag `drill.sweptCut`): `drillStep {x, y, drive}` every tick
 *    the drill is engaged cuts the stamp's path since the last step in sub-step drill time, gated
 *    on every crossed cell and held to the terrain budget, and the vehicle may carry `sweptCut`;
 *    a report whose ticks the steps cut no longer cuts them. The pose bound is 300 mm a tick (18
 *    m/s). With no step sent no digest or mined order changes.
 * 51: self-acting items on the auto core (ticket 328, the GD lock on #206): the steam shield's
 *    auto actor presses its slot through `power-up-core`'s press path, `PowerUpAutoFired`, the
 *    pending use's `autoPressTick`, a use by hand cooling down for auto's override gap while
 *    the item is on auto, and a press by hand withdrawing a same-tick auto press. With auto off
 *    no digest or mined order changes.
 * 52: the ground-gun slice (ticket 314, #309 build 2): the `ground-gun` player section v1 with
 *    the three track levels, `ground-gun.mount` and `ground-gun.buy_level {track}` with
 *    `ground-gun.GunMounted` and `ground-gun.TrackLevelBought`, `debug.ground-gun.setLevels`, the
 *    `boreGun` provider built from the tracks, and the pickup of bored ore on the trip's income
 *    cap with `ground-gun.BoredOreCapped`. With no gun mounted no digest or mined order changes.
 * 53: the resonance whistle (ticket 262, #245 build 2): the `aetheric` player section v1 with
 *    each player's sounding whistle, its `aetheric.lures` clock step, `aetheric.WhistleSounded`,
 *    and the hunters' step hearing its lure (`enemy.lureRetarget` on). With no whistle blown no
 *    digest or mined order changes.
 * 54: casing_cement reinforcement (ticket 367, ruling B on #367): the `casing-cement` slice's
 *    `groundReinforcement` provider cases every open tile with an intact cement-grade lining
 *    sample (refractory, insulated, grounded) in it or on its one-sample border, so its blocks
 *    never warn or refill. Standard lining cases nothing, so no P1-P7 digest or mined order changes.
 * 55: the chronometric governor and the aether condenser (ticket 263, #245 build 4): the
 *    `aetheric.pocket` and `aetheric.heat` player sections v1, the governor's slow on every enemy
 *    step in its pocket (`enemyStepModifiers`) and its `aetheric.pockets` clock step,
 *    `aetheric.PocketOpened`, `aetheric.HeatCondensed` and `debug.aetheric.setItemHeat`. With no
 *    pocket opened and no heat condensed no digest or mined order changes.
 * 56: bore struts (ticket 379, K-strut of the TD lock on #318): a line whose shot carries
 *    `strutTicks` stops at a hollow's edge (`BoreEnded` stop `strut`) and wedges a strut in its
 *    mouth (`StrutPlaced`, `AuthorityState.struts`), which collapse reads through the #157
 *    reinforcement registry until the clock takes it away. With no strut shape no digest or mined
 *    order changes.
 * 57: grounded bore lines (ticket 378, K-ground in the TD lock on #318): a shot shape's
 *    `groundTicks` rides on the pending shot, each ended line grounds the cells it opened in
 *    `groundedLines` until `BoreEnded`'s `groundedUntilTick`, and the electrified shock skips a
 *    grounded cell. With no grounding shape no digest or mined order changes.
 * 58: the lanes' P16 forks (ticket 259, the GD lock on #255): the `tech-tree.forks` player section
 *    v1 with each lane's active branch, `tech-tree.choose_fork` and `tech-tree.rechoose_fork
 *    {lane, branch}` with `tech-tree.ForkChosen`, `ForkRechosen` and `ForkRefused`, and
 *    `unlock_node` refusing a branch or an inactive branch's Marks as `fork_branch`. With no fork
 *    chosen no digest or mined order changes.
 * 59: the forced fork branch (ticket 267, #255 build 2): `debug.tech-tree.forceFork {lane,
 *    branch}` makes the branch its lane's active one, free and outside its tier, for the
 *    `balance:forks` bot. With no branch forced no digest or mined order changes.
 * 60: the aetheric lane's P16 fork pair (ticket 261, #245 build 3 and #255 build 5): the
 *    `aetheric.phase` player section v1 with each player's phase under way, the lantern's move on
 *    the motion seam and its `aetheric.phases` clock step, `aetheric.PhaseStarted`,
 *    `PhaseLanded`, `PhaseReversed` and `PhaseReturned`, and the arc coil's `aetheric.ArcFired`.
 *    With no fork item used no digest or mined order changes.
 * 61: the drill-gear and mobility forks' branches (ticket 268, #255 build 3): `choose_fork` now
 *    takes Wide, Deep, Agile and Armoured, and an active branch acts: Wide's flank cells and
 *    Deep's cell below on the drill gear read, Agile's lift and drive off the ground, Armoured's
 *    grounded hits and longer steam curtain. With no fork chosen no digest or mined order changes.
 * 62: the extraction, terrain and sensing P16 fork branches (ticket 269, #255 build 4): the
 *    Prospector's choice in the mineral drain, the Bracer's props (a reaction to `CollapseWarned`
 *    into the `terrain-tools` section's optional `props`, claimed through `collapseBraces`), the
 *    Breaker's fracture as a blast effect on the K6 queue, and the Scout pinger and Diviner rod as
 *    charged items. With no branch chosen no digest or mined order changes.
 * 63: the shoring shot (ticket 369, piece iii of the #157 seam): the `ground-gun.shot-cells`
 *    session section v1 holds every cell a cementing round's line opened as permanent ground
 *    through the `groundReinforcement` registry, each billed onto the lining bill at its band and
 *    logged as `ground-gun.ShotCellsReinforced`. With no cementing round fired no digest or mined
 *    order changes.
 * 64: the turret shape (ticket 382, K-turret of the TD lock on #319): the `autoGuns` provider's
 *    `TurretShape`, read once per due shot, sets the guns' range, shot energy, the fire director's
 *    order (the combat vehicle's optional `directorPick`), the sentry cam's open cone (the
 *    vehicle's optional `stillSinceTick`), grapeshot's split (a gun tally's optional `energy`),
 *    concussion's knock (the enemy's optional `knockedTick`) and a one-bounce ricochet. With no
 *    provider no field is written and no digest or mined order changes.
 * 65: Overpressure's toggle (ticket 383, K-burst of the TD lock on #319): `turret.burst {on}`
 *    (refused `no_guns` or `no_burst`) answers `TurretBurstSet`, keeps the vehicle's optional
 *    `gunBurst` with the shape's `burst` cycle, and the guns fire at the burst's cadence, then
 *    idle for its vent. With no burst switched on no field is written and no digest or mined order
 *    changes.
 * 66: stabiliser foam (ticket 381, the GD default ruling on #381): no longer held back, a spray
 *    sets foam on a forward cone into the `terrain-tools` section's optional `foam` and logs
 *    `terrain-tools.FoamSet`; a timed `collapseBraces` provider holds each set cell's block for 600
 *    ticks and the `terrain-tools.lapse-foam` clock step drops each cell as it lapses. Researching
 *    foam's node owns it with a full stack (`terrain-tools.FoamStocked`). With no foam owned no
 *    digest or mined order changes.
 * 67: stabiliser foam's permanent cure (ticket 368, piece iv of the #157 seam): a spray at the
 *    Mark that masters foam also cures its set cells into the `terrain-tools.cured-foam` session
 *    section v1, read through the `groundReinforcement` registry, each billed onto the lining bill
 *    at its band and logged as `terrain-tools.FoamCured`. With no foam cured no digest or mined
 *    order changes.
 * 68: four aetheric pair combos in play (ticket 373, the GD ruling on #373): still foam's blocks in
 *    the `aetheric.pocket` section's optional `stilledBlocks`, slowed with the pocket; the warning
 *    chime's whistle press from a clock step with its target in the `aetheric` section's optional
 *    `chime`; the pendulum anchor's governor press on an anchor switched on in open air; quench
 *    cutters' side-cutter heat on the `aetheric.heat` gauge per dig second; and
 *    `aetheric.FoamStilled`, `WarningChimed`, `PendulumSwung` and `CuttersQuenched`. With no combo
 *    owned no digest or mined order changes.
 * 69: the auto_guns modules (ticket 388, the #319 GD split): the ground-gun slice registers the
 *    `autoGuns` provider and the Flushing shell's `enemyFlushes` entry, so every pose report and
 *    cut now writes the vehicle's `stillSinceTick` (ticket 382's sentry fact) and owned turret
 *    modules shape the turret's shots. Only that field moves the digests; mined orders are unchanged.
 * 70: the movers' trip ledger (ticket 408, Systems ruling 6167240683 on #385): the ore an
 *    ore-shifter drags, a pocket lance pushes out or a lodestone beacon gathers is banked on the
 *    `extraction` trip counter under `tripCapAt`, a nodule past the cap stays where it is, and a
 *    use that moved nothing for the cap is refused `terrain-tools.trip_capped`. With no mover used
 *    no digest or mined order changes.
 * 71: the 4-tick tile floor (ticket 396, a stopgap the #397 law removes): `drill.minTicksPerTile`
 *    goes from 24 ticks to 4, so a strong drill breaks a cell in as little as 4 ticks and its
 *    travel parity passes the engine, and a cell at the floor takes exactly the floor (a 40-digit
 *    rounding once read some hardnesses one tick or sub-step longer). Goldens that dig past the
 *    old floor change.
 * 72: price-only purchases (ticket 411, Bjor's ruling of 14 Oct): no buy reads the session's
 *    planet. `tech-tree.unlock_node` and `choose_fork` drop the tier, discovery-grace, absorbed-row
 *    and lab-planet locks and charge each node its anchor's price on every planet (a held row's
 *    node refused `held_feature`); `buyVehicleItem` sells a researched extractor or magnet on any
 *    planet; `buyGun` mounts and `buyLiningType` unlocks once the row ships, at the row planet's
 *    price. A command log that bought ahead of its anchor, or past it at the later planet's
 *    price, now answers differently; a run that buys none of these moves no digest or mined order.
 * 73: the consumable restock (ticket 394, X2; the GD ruling on #381, option c):
 *    `power-up-core.restock_consumable {itemId}` fills the player's own stack of a consumable a
 *    slice registered a `consumable-restock` for, at the Upgrade bay, each charge at its band-ore
 *    price on the current planet, and answers `power-up-core.ConsumableRestocked`. Foam is the
 *    first. With no restock sent no digest or mined order changes.
 * 74: scripted mining reads the drill gear (GD ruling on #392, ticket 392): a `drillTile` carves
 *    the owned gear's cells past and beside the bored cell, aimed by the last reported pose, as
 *    the reported drill does, so the pacing bot cuts with Deep, Wide or a switched-on boom. With no
 *    gear owned no digest or mined order changes.
 * 75: the bore line (ticket 412, K-line, the TD lock on #320): the `BoreEnded` that ends a shot
 *    carries the shot's opened cells as optional `lineCells` (at most 50) while a slice's
 *    `boreLineListeners` entry wants them. An event field, not saved state: with no listener
 *    answering, no event, digest or mined order changes.
 * 76: the exact drill carry (ticket 399, K-carry of the TD lock on #397 with the TD ruling on
 *    #399): a `drillStep` reaches only as far as its tick's work and the cursor's carried
 *    `carrySubSteps` pay for, cell by cell along the stamp's centre at each cell's drill time
 *    times its uncut share; a paid cell clears in full, the rest carries exactly, and gated or
 *    tip-locked cells discard it. Saved at snapshot 21. With no drill step sent (`drill.sweptCut`
 *    off) no digest or mined order changes.
 * 77: the engine card judges the planet's hardest band (GD ruling on #418, option a; TD shape on
 *    #418): `buyUpgrade('engine')` is refused `max_level` only once k times the drill's cut speed
 *    in the hardest of bands 1 to 5 reaches the engine's top speed, wherever the rig stands, so a
 *    step that still speeds deep travel is sold at the dock. Travel speed itself is unchanged. A
 *    command log that bought an engine step the old band-1 reading refused now answers
 *    differently; a run that never reached that reading moves no digest or mined order.
 * 78: no tile floor (ticket 397, the TD lock on #397 and the GD ruling on #396): the drill law is
 *    `ceil(60 H / (D eff))` with no `drill.minTicksPerTile`, so a drill past the old 4-tick floor
 *    breaks a cell in its own time, down to one tick (one sub-step on the swept cut), its step
 *    bound and travel parity following that cut speed. Goldens that dig past the old floor change.
 * 79: the swept carve clears a body-wide bore at any cells a tick (ticket 439, the TD shape on
 *    #397): a fresh `drillStep` path whose reach lies more than the stamp's radius from the body
 *    point cuts the capsule from the body to its reach, not the bare disc at the reach, so the
 *    body's own cell and the rim along the path open as a continuing step's do. A fresh reach
 *    within one radius cuts the same bare disc as before. With no drill step sent
 *    (`drill.sweptCut` off) no digest or mined order changes.
 * 80: the carry releases its cell (ticket 421, rule (b) of the GD ruling 6204353563 in the TD's
 *    shape 6204362873): once the cell the swept cut's carry works toward lies in the body's next
 *    step the stamp carves it too, still asking its gates, and the walk pays what the stamp's bite
 *    left of it on the tick it meets it, discarding the surplus; a carry banked against it is
 *    clamped to that. Which cells a `drillStep` pays, and in what order, change. With no drill step
 *    sent (`drill.sweptCut` off) no digest or mined order changes.
 * 81: `drillStep` carries the head's facing (ticket 506, the TD shape 6218234935 as the GD ruled
 *    it): a required `facing` 0 to 3, refused `invalid_pose` outside that, replaces the last
 *    report's facing in the step's pose, its cut gate and the client's cut-follow read, so a cut
 *    after a turn starts on the head's settle tick, not up to 12 ticks later on the next report.
 *    A protocol-80 `drillStep` line has no facing and is refused as malformed. With no drill step
 *    sent (`drill.sweptCut` off) no digest or mined order changes.
 * 82: the epic and mythic trip clamp (ticket 509, seam A' of the TD ruling 6221725921 on #445):
 *    every ore unit that reaches the hold, on every route, is priced by the one `orePickup`
 *    provider. The `ores` slice pays an epic or mythic find in full only while the trip's clamped
 *    value stays within 15% of a full hold of the find's band ore, else at the band's own tier, and
 *    keeps that value in its `ores.rarity-trip` section until the dock or a rescue. A run that
 *    never keeps an epic or mythic find (every legacy-row planet, P1 and P2) moves no digest.
 * 83: a pose report's drill raises `DrillGated` once per gated cell it holds (ticket 519, the TD
 *    ruling 6225185887 on #519): the vehicle keeps the standing gated cells its last drilling
 *    report met as `gatedBite`, and the next report leaves out the ones already in it while the
 *    bite runs on unbroken (written at the last charged report, the drill on every tick since).
 *    The first meeting of a cell always fires, and the cut, its charge and its dig time are
 *    unchanged. A command log recorded under 82 or earlier names its protocol in `metadata.json`
 *    (`runMetadata.ts`), so it is compared and replayed under that number, never re-read under 83.
 *    A run that never holds a gated cell under a report moves no digest.
 * 84: the casing trail keeps its points apart and never lays inside the lag (ticket 538, the TD
 *    ruling 6228998310 on #538): a recorded axis point is kept only at least one ring spacing from
 *    every point still waiting for its ring, on the pose report's path and the swept cut's alike;
 *    one the rule rejects is dropped, its stretch folded into no ring. Past
 *    `MAX_CASING_TRAIL_POINTS` (6 to 9) the newest are dropped instead of the oldest being laid at
 *    once, so a rig cutting back over its own trail lays no ring under its stamp. A run that never
 *    cuts back within the ring lag of its own trail moves no digest.
 * 85: a pose report's own cut is charged on the density it removed (ticket 535, A6 "Option L", the
 *    TD shape 6228682000 on #529 as VS and the GD ruled it; behind the authority dev flag
 *    `drill.exactCarry`, on): the carve is the same whole-tick carve as before, byte for byte, but
 *    every sample it removes is tallied at its cell's law time and charged at the swept price with
 *    an integer carry on the vehicle (`cutEnergyCarry`), never more than the tank holds, the debt
 *    carried; the report heats from the same tally in whole drill ticks, the rest carried
 *    (`cutHeatCarry`), where it charged the ticks its stamp removed something in and heated for
 *    its drill ticks. A cut the swept cut's steps made, `drillTile` and the pacing bot are
 *    unchanged. With the flag off every digest is protocol 84's. A command log recorded under 84
 *    or earlier is compared and replayed under its own number. A run with no report that drills
 *    moves no digest.
 * 86: the swept cut is charged on the law work it removed (ticket 540, Systems' ruling 6231144515,
 *    the TD seam 6234992964 as VS 6234998337 and the GD confirmed it; behind the authority dev flag
 *    `drill.sweptLawCharge`, off): a `drillStep`'s carve, the same sub-step carve byte for byte,
 *    tallies each sample it removes and each paid cell it clears at its cell's law time, and is
 *    charged as A6 charges a report (`payLawWorkEnergy`), on the vehicle's one energy carry, where
 *    it charged each broken cell its own dig energy; its heat is unchanged. With the flag off, or
 *    with no drill step sent (`drill.sweptCut` off), every digest is protocol 85's.
 * 87: a pose report at interval 1 carves the capsule from the previous reported pose (ticket 537,
 *    A7, the TD shape 6228947744 section 4 with the HS additions, bounded by the GD 6241320435;
 *    behind the authority dev flag `drill.reportCapsule`, on, and only with `drill.exactCarry`,
 *    which interval 1 is tied to): where the drill ran the one tick since the last charged report
 *    on the same facing and the pose moved by at most one stamp radius, the report cuts the capsule
 *    from the previous pose's stamp centre to this one's on the swept cut's sub-step clock, in
 *    place of the bare disc at the pose on whole ticks, charged as A6 charges it (the law work
 *    removed with the carry), and its drill gear's cells are cut on every tick of the bite. A
 *    12-tick report, a fresh bite, a turn, a still rig, a longer step and the exact carry off cut
 *    protocol 86's bare disc byte for byte, so with the flags as shipped every digest is protocol
 *    86's; with the exact carry on, every 12-tick golden replays to protocol 85's charged digests.
 * 88: a report's drill ticks heat for all the law work they stand for (ticket 541, shape (b), the
 *    TD seam 6232743242 priced by Systems 6232736622; behind the authority dev flag
 *    `heat.workUncapped`, off): where they outnumber the ticks since the gauge settled, the
 *    drilling segment keeps its wall ticks and heats `drillHeat × work` over them, an exact ratio
 *    of ticks, where the #113 rule dropped the rest; band heat, cooling and the gauge at its max
 *    are unchanged, and a charged report at the tick the gauge settled leaves its whole drill
 *    ticks on the heat carry for the next. With the flag off every digest is protocol 87's, and the
 *    bot's whole-tick clock heats the same with it on.
 * 89: the codex records the species a player touches (ticket 546, the TD's contact rule
 *    6243331970 as the GD amended it 6243342631; behind the authority dev flag
 *    `codex.materialContact`, on): the first drill damage on, gate stop at, unit in the hold from
 *    or tool sample of a cell whose kind slot binds a species writes `material:<species id>`
 *    into the player's codex section (v1) and says `codex.EntryAdded`, once per player per
 *    species. A run that never touches a roster-bound cell moves no digest; with the flag off
 *    every digest is protocol 88's.
 * 90: the authority dev flags as logged state (ticket 547, the TD ruling on #547 and its
 *    amendment): `debug.setFlags {delta}` (refused `unknown_flag`, or `not_session_host` from any
 *    player but a shared session's lowest id) sets flags, answers `DevFlagsSet`, keeps the flags
 *    off their shipped defaults as the state's optional `devFlagDelta` and marks it with
 *    `devFlagsEverSet`, and drops the carries of a flag it turns on. The rules read `flagsOf`
 *    (the defaults with the delta) in place of the module global. With no flag set no field is
 *    written and no digest or mined order changes.
 */
export const AUTHORITY_PROTOCOL_VERSION = 90

/** The kernel's own commands: the closed set its rule tables are written against. */
export interface KernelCommandPayloads {
  /**
   * The local vehicle's pose at 5 Hz (#11 amendments, #7): integer mm and mm/s, the body-up vector
   * scaled to 1024, `facing` 0 to 3, the action flags at the moment of the report, and how many
   * fixed steps since the previous report each action was active, which the authority charges.
   * `drive` is the push at the report as signs (TD lock on #279); drill gear reads its `x`.
   */
  reportPose: {
    x: number
    y: number
    vx: number
    vy: number
    upx: number
    upy: number
    facing: number
    driving: boolean
    thrusting: boolean
    drilling: boolean
    thrustTicks: number
    driveTicks: number
    drillTicks: number
    drive: DriveSigns
  }
  /** Scripted mining (#3, #11 section 5): `ticks` fixed steps of drilling on one tile. */
  drillTile: { tx: number; ty: number; ticks: number }
  /**
   * The swept cut (ticket 330, dev flag `drill.sweptCut`): the body's position in mm at a fixed
   * step its drill is engaged, the head's settled `facing` 0 to 3 (ticket 506), and the push as
   * signs (`drive.y` 1 lifting), sent every such step.
   */
  drillStep: { x: number; y: number; facing: number; drive: DriveSigns }
  /** Calls the tow for a stranded or destroyed vehicle (#7, #8). */
  requestRescue: Record<string, never>
  /** The platform (#8, #23, #37): dock when stationary in that bay's pad zone, and leave again. */
  dock: { bay: BayId }
  undock: Record<string, never>
  /** The shop: one ore tier, or `"all"` of the hold's ore. */
  sellCargo: { resourceTier: number | 'all' }
  /** The workshop's repair and the charging station, each to full at current prices. */
  repairHull: Record<string, never>
  rechargeEnergy: Record<string, never>
  /** "Sell, repair and recharge": sell all, repair, recharge, in that order (#8). */
  quickService: Record<string, never>
  /**
   * The workshop: one step of one upgrade track (#7, #180). On every stepped row `chain` is 0 for a
   * click, else the id of the hold the step belongs to (ticket 226, `purchaseChain.ts`).
   */
  buyUpgrade: { upgradeId: string; chain: number }
  /** The Upgrade bay's Casing row: one casing grade, not a vehicle track (#41, #58). */
  buyCasingGrade: { chain: number }
  /**
   * The Upgrade bay's Guns row (#107): mounts the guns once `auto_guns` is unlocked, then raises
   * the gun track one level a buy.
   */
  buyGun: { chain: number }
  /** The HUD toggle: `"auto"` fires by itself, `"off"` saves the boiler (#107). */
  setGunMode: { mode: string }
  /**
   * The Upgrade bay's Lining row (#113): unlocks a lining type once its row is open (refractory
   * from planet 8) and makes it the active type; `selectLiningType` switches between owned types.
   */
  buyLiningType: { liningType: string }
  selectLiningType: { liningType: string }
  /**
   * The Refinery bay (#105): moves up to half the hold of one ore tier into a free slot, and buys
   * the next slot. Ready batches are collected, and paid, at the Sell bay only.
   */
  queueRefine: { resourceTier: number; units: number }
  buyRefinerySlot: Record<string, never>
  collectRefined: Record<string, never>
  /** Moves the docked platform to the next planet, paying the fee and the core (#10). */
  travel: { toPlanet: number }
  /** `interact` while overlapping the planet's live artefact cache opens its choice (#46). */
  openArtefactCache: Record<string, never>
  /** Takes one of the three options for good; the other two are gone (#46). */
  chooseArtefact: { optionId: string }
  /**
   * Plants a charge of `size` from the rack on the wall the last reported pose faces; it blows after
   * its size's fuse, or waits for the plunger if remote (#109, sizes K8 #218).
   */
  plantCharge: { size: number }
  /** The Upgrade bay sells `count` charges of `size` if they fit the rack, never fewer (K8 #218). */
  restockCharges: { size: number; count: number }
  /** The Upgrade bay adds one slot to the rack (#109). */
  buyChargeRackSlot: { chain: number }
  /**
   * The loadout (#162 TD lock, K4): puts an owned item in a slot that accepts it, or empties the
   * slot with a null item; docked at the platform only. A refusal is answered as `EquipRefused`.
   */
  equipItem: { slot: string; itemId: string | null }
  /**
   * The Upgrade bay buys a vehicle item the tech tree unlocked, at the price its card shows
   * (ticket 248); owned, it can be slotted by `equipItem`.
   */
  buyVehicleItem: { itemId: string }
  /**
   * The bore gun (ticket 313, #309): one shot along `bearing` 0 to 255 round the lower half-plane
   * of the rig's frame, clamped to the arc; its cells open on the authority's clock.
   */
  'ground_gun.fire': { bearing: number }
  /**
   * The bore gun's auto mode (ticket 317, #310): on, the authority picks and fires the shots
   * itself, holding where the rules say; refused until the steam sear is researched.
   */
  'ground_gun.set_auto': { on: boolean }
  /**
   * Overpressure's held toggle (ticket 383, the TD lock on #319): on, the turret runs its shape's
   * burst cycle, a burst at the faster cadence then a vent; off, it vents out what is due.
   */
  'turret.burst': { on: boolean }
  'debug.setUpgrade': { upgradeId: string; level: number }
  /** Energy in units as a decimal string, a whole number of 1/240 quanta (#11 amendment 2). */
  'debug.setEnergy': { energy: string }
  /** Hull as a canonical decimal string (a BigStat, #7). */
  'debug.setHull': { hull: string }
  /** The player holds this artefact, as if chosen from this planet's cache (a scenario start). */
  'debug.setArtefact': { optionId: string }
  'debug.setPlanet': { planetIndex: number }
  'debug.setPlanetSeed': { planetSeed: number }
  /** Adds `amount` (a decimal string) to the player's wallet. */
  'debug.grantMoney': { amount: string }
  /** Sets the platform's core bay to `count` fragments (#10 `setCoreFragments`). */
  'debug.setCoreFragments': { count: number }
  /** Replaces the player's wallet with `amount` (a start scenario's money). */
  'debug.setMoney': { amount: string }
  /**
   * Combat (#9, #11 amendment): an enemy of any registered kind and tier, `dx, dy` whole tiles
   * from the vehicle's tile, hunting this player's vehicle.
   */
  'debug.spawnEnemy': { kind: string; tier: number; dx: number; dy: number }
  'debug.clearEnemies': Record<string, never>
  /**
   * Puts the vehicle at rest in one bay and docks it there, no tow and no fee (#11 section 5,
   * #37: scripted runs move between the bays with it).
   */
  'debug.teleportToDock': { bay: BayId }
  /** Frozen enemies neither move, wind up, attack nor spawn; the drill still cuts them. */
  'debug.freezeEnemies': { frozen: boolean }
  /**
   * The ground (#36): lower or raise density by up to `amount` (0 to 255) in a disc of `radius`
   * mm round `(x, y)` mm, softened at the rim like the drill's stamp. Never cuts the dock pad.
   */
  'debug.carveCircle': { x: number; y: number; radius: number; amount: number }
  'debug.fillCircle': { x: number; y: number; radius: number; amount: number }
  /** Sets the gun step directly, 0 (no guns) or the mount to the cap (#107 combat scenarios, #180). */
  'debug.setGunLevel': { level: number }
  /** A mounted rack with `slotLevel` bought slots carrying only `carried` charges of `size` (#109). */
  'debug.setCharges': { size: number; carried: number; slotLevel: number }
  /** Sets the vehicle's casing grade directly (#41 `debug.setCasingGrade`). */
  'debug.setCasingGrade': { grade: number }
  /** Owns and selects a lining type, with no unlock or price (#113 scenarios). */
  'debug.setLiningType': { liningType: string }
  /**
   * A scenario's loadout (K4), replacing the vehicle's: each named slot holds its item, every slot
   * not named is empty, and the vehicle owns exactly those items and `owned` (extractors, cradles,
   * spares), with no dock, price or slot lock.
   */
  'debug.setVehicleLoadout': { slots: Readonly<Record<string, string>>; owned: readonly string[] }
  /** Sets the heat gauge to whole gauge points, 0 to its max, settled at the command's tick (#113). */
  'debug.setHeat': { heat: number }
  /** One ring of casing lining of `grade` round `(x, y)` mm, in the active lining type (#41, #113). */
  'debug.lineCasing': { x: number; y: number; grade: number }
  /** Breaches the ring of lining round `(x, y)` mm as a tunnel wrecker's gnaw does (#111). */
  'debug.gnawCasing': { x: number; y: number }
  /**
   * Starts the collapse of one block (`cx,cy#index`) now, as if it were weak (#43
   * `debug.forceCollapse`): it warns for the full 60 ticks and refills whatever its lining.
   */
  'debug.forceCollapse': { block: string }
  /**
   * Sets authority dev flags (ticket 547): each named flag takes its value, the rest keep theirs,
   * and the session keeps only the ones off their shipped defaults. Flags, never numbers.
   */
  'debug.setFlags': { delta: Readonly<Record<string, boolean>> }
}

/**
 * Every command, the kernel's and the slices'. A slice adds its commands by module augmentation,
 * each type prefixed `<slice>.` (or `debug.<slice>.` for a debug command), and registers their
 * rules (docs/standards/feature-slices.md 3.15):
 *
 *   declare module '<path to>/systems/authority/authorityCommand' {
 *     interface CommandPayloads { 'example.ringBell': { strokes: number } }
 *   }
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- the slices' augmentation point
export interface CommandPayloads extends KernelCommandPayloads {}

export type KernelCommandType = keyof KernelCommandPayloads

export type CommandType = keyof CommandPayloads

/** Who sent a command and where it sits in the `(tick, seq)` order; domain events carry it too. */
export interface CommandStamp {
  playerId: string
  tick: number
  /** Strictly increasing per player. */
  seq: number
}

/** What a caller wants done; the sender adds the stamp when it submits. */
export type CommandIntent<T extends CommandType = CommandType> = {
  [K in T]: { type: K; payload: CommandPayloads[K] }
}[T]

export type AuthorityCommand<T extends CommandType = CommandType> = CommandStamp & CommandIntent<T>

export function isDebugCommandType(type: CommandType): boolean {
  return type.startsWith('debug.')
}
