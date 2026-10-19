/**
 * One row per dev flag (ticket 547, the TD ruling on #547 and its amendment item 7): what the debug
 * flag panel (#549) lists, in plain words, beside the flags in `devFlags.ts`. A spec fails while a
 * flag of `DevFlags` or `AuthorityDevFlags` has no row, so a flag added later reaches the panel by
 * construction. Flags only: the drill law's constants, caps and prices are not panel items and
 * get no row (VS 6).
 *
 * The labels are HS (d) and VS on #547: a flag that changes the cut cells or the pace says so and
 * that the run is tainted; `drill.sweptCut` stays experimental until #540 and #541 flip it.
 */
import { AUTHORITY_DEV_FLAGS, DEV_FLAGS, type AuthorityDevFlags, type DevFlags } from './devFlags'

/** The client loop's own flags, or the authority's world rules (host only in a shared session). */
export type DevFlagScope = 'client' | 'authority'

type DevFlagId = keyof DevFlags | keyof AuthorityDevFlags

export interface DevFlagRow {
  id: DevFlagId
  scope: DevFlagScope
  /** The panel's title for the flag, at most four words (#549). */
  name: string
  /** One game-like sentence the panel shows under the name (#549). */
  line: string
  /** One line in plain words: what the flag does while on. */
  meaning: string
  /** The shipped value, read from `devFlags.ts`. */
  isOnByDefault: boolean
  /** When a change takes. */
  applyRule: string
  /** The flags it needs or fights with, or `NO_PAIRING_RULE`. */
  pairingRule: string
  /** Shown beside the toggle when the flag changes the cut cells or the pace (HS d). */
  taintLabel: string | null
  isExperimental: boolean
  /** Flags it does nothing without: the panel warns while it is on and one is off (VS 4). */
  needsOn: readonly DevFlagId[]
}

export const NO_PAIRING_RULE = 'No pairing rule recorded.'

export const CUT_OR_PACE_LABEL = 'Changes cut cells or pace; run is tainted.'

/** The nose contact's label (ticket 564, the TD's C2 shape on #551). */
export const ENEMY_CONTACT_LABEL = 'Changes enemy contact; run is tainted.'

const CLIENT_APPLY_RULE = 'Client loop only, never sent to the authority; local to this browser.'
const AUTHORITY_APPLY_RULE =
  'Live, as a logged debug.setFlags at its tick; host only in a shared session.'

export const DEV_FLAG_ROWS: readonly DevFlagRow[] = [
  {
    id: 'drill.sweptCut',
    name: 'Swept cut',
    line: 'The drill cuts the world every tick as it sweeps.',
    scope: 'client',
    meaning:
      'The client sends a drill step every fixed step, so the authority cuts every tick and the motor follows the drill law.',
    isOnByDefault: DEV_FLAGS['drill.sweptCut'],
    applyRule: `${CLIENT_APPLY_RULE} A flip waits until the drill is idle.`,
    pairingRule:
      'Experimental until #540 and #541 flip it: it over-removes. With it on, drill.reportEveryTick reads nothing; drill.sweptLawCharge acts only with it on.',
    taintLabel: CUT_OR_PACE_LABEL,
    isExperimental: true,
    needsOn: [],
  },
  {
    id: 'drill.reportEveryTick',
    name: 'Every-tick reports',
    line: 'The drill tells the world where it is every tick.',
    scope: 'client',
    meaning:
      'With the swept cut off, a pose report goes out every tick the drill bites, not every 12.',
    isOnByDefault: DEV_FLAGS['drill.reportEveryTick'],
    applyRule: CLIENT_APPLY_RULE,
    pairingRule:
      'Takes only with drill.exactCarry on (the loop reports every 12 ticks until then); reads nothing with drill.sweptCut on.',
    taintLabel: CUT_OR_PACE_LABEL,
    isExperimental: false,
    needsOn: ['drill.exactCarry'],
  },
  {
    id: 'enemy.lureRetarget',
    name: 'Lure retarget',
    line: 'Hunters chase a live lure instead of your vehicle.',
    scope: 'authority',
    meaning: "Hunters path to a live lure's cell instead of the vehicle.",
    isOnByDefault: AUTHORITY_DEV_FLAGS['enemy.lureRetarget'],
    applyRule: AUTHORITY_APPLY_RULE,
    pairingRule: NO_PAIRING_RULE,
    taintLabel: CUT_OR_PACE_LABEL,
    isExperimental: false,
    needsOn: [],
  },
  {
    id: 'drill.exactCarry',
    name: 'Exact carry',
    line: 'Each cut is charged for exactly the rock it removed.',
    scope: 'authority',
    meaning:
      "A pose report's cut is charged on the density it removed at the law time, with an integer carry, and heats from the same tally.",
    isOnByDefault: AUTHORITY_DEV_FLAGS['drill.exactCarry'],
    applyRule: `${AUTHORITY_APPLY_RULE} Turned on, it drops the report carries.`,
    pairingRule:
      'A report every tick needs it on: turned off, the client reports every 12 ticks from the same tick, since interval 1 without it breaks the tank floor (0.853 of the law at 25 m/s, 1.300 at 44 m/s).',
    taintLabel: CUT_OR_PACE_LABEL,
    isExperimental: false,
    needsOn: [],
  },
  {
    id: 'drill.sweptLawCharge',
    name: 'Swept law charge',
    line: 'The swept cut pays for the work it really did.',
    scope: 'authority',
    meaning: 'The swept cut is charged on the law work it removed.',
    isOnByDefault: AUTHORITY_DEV_FLAGS['drill.sweptLawCharge'],
    applyRule: `${AUTHORITY_APPLY_RULE} Turned on, it drops the energy carry and the swept cursor's carried work.`,
    pairingRule:
      'Has no effect without the swept path: with drill.sweptCut off no drill step is sent.',
    taintLabel: CUT_OR_PACE_LABEL,
    isExperimental: false,
    needsOn: ['drill.sweptCut'],
  },
  {
    id: 'drill.reportCapsule',
    name: 'Report capsule',
    line: 'Each report carves the whole path since the last one.',
    scope: 'authority',
    meaning:
      'At interval 1 a report carves the capsule from the last reported pose, capped at one stamp radius (950 mm).',
    isOnByDefault: AUTHORITY_DEV_FLAGS['drill.reportCapsule'],
    applyRule: AUTHORITY_APPLY_RULE,
    pairingRule: 'Live only with drill.exactCarry on, at a report every tick.',
    taintLabel: CUT_OR_PACE_LABEL,
    isExperimental: false,
    needsOn: ['drill.exactCarry', 'drill.reportEveryTick'],
  },
  {
    id: 'heat.workUncapped',
    name: 'Uncapped work heat',
    line: 'The drill heats up for all the work it does.',
    scope: 'authority',
    meaning: "A report's drill ticks heat for all the law work they stand for.",
    isOnByDefault: AUTHORITY_DEV_FLAGS['heat.workUncapped'],
    applyRule: `${AUTHORITY_APPLY_RULE} Turned on, it drops the heat carry.`,
    pairingRule: NO_PAIRING_RULE,
    taintLabel: CUT_OR_PACE_LABEL,
    isExperimental: false,
    needsOn: [],
  },
  {
    id: 'codex.materialContact',
    name: 'Material contact',
    line: 'The codex notes each rock the drill first touches.',
    scope: 'authority',
    meaning:
      'The codex records a species on first real contact; off, nothing new is written and the species looks hide, the saved records kept.',
    isOnByDefault: AUTHORITY_DEV_FLAGS['codex.materialContact'],
    applyRule: `${AUTHORITY_APPLY_RULE} Turned on, it writes only on contact from then on, never backfilling.`,
    pairingRule: NO_PAIRING_RULE,
    taintLabel: null,
    isExperimental: false,
    needsOn: [],
  },
  {
    id: 'drill.noseContact',
    name: 'Nose contact',
    line: 'Enemies the drill crosses ride its nose.',
    scope: 'authority',
    meaning:
      'Enemies the walked path crosses are engaged at any speed: they ride the nose for their dwell, or hold the cut if tougher.',
    isOnByDefault: AUTHORITY_DEV_FLAGS['drill.noseContact'],
    applyRule: `${AUTHORITY_APPLY_RULE} An enemy already riding rides out its dwell.`,
    pairingRule:
      'Off until the combat damage track (#565) flips it: with drill power as the damage it is a hidden combat power gain. Has no effect without the swept path.',
    taintLabel: ENEMY_CONTACT_LABEL,
    isExperimental: false,
    needsOn: ['drill.sweptCut'],
  },
]
