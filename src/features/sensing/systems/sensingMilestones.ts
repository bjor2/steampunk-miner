/**
 * The sensing items' Mark milestones (the GD lock on #256, build 5): the class table's pattern at
 * Marks 3, 6 and 9 of each shipped item's ladder, with the verb its card line names. No sensing
 * item moves ore, so its milestones change only what a use reveals and where; each link spends the
 * sibling's own charge (power-up-core, ticket 274). The three passives carry a link only, fired
 * at their own moment (`passiveLinks.ts`).
 *
 * The threat periscope's link is the lock's worked example; the other verbs are this ticket's
 * picks, worded by Content's check on #276. The assay lens links to the signal buoy (the GD ruling
 * on #276), so it never overlaps the periscope's echo. The galvanic probe and the void sounder stay
 * held, with none.
 */
import { milestonesOf, type MarkMilestone, type MilestoneVerbs } from '../../tech-tree'
import type { SensingItem } from './sensingCatalogue'

const ECHO_SOUNDER = 'power.echo_sounder'
const FLARE_MORTAR = 'consumable.flare_mortar'
const SIGNAL_BUOY = 'consumable.signal_buoy'

const VERBS: Readonly<Record<string, MilestoneVerbs>> = {
  [ECHO_SOUNDER]: {
    secondTap: 'pings one radius ahead of the drill',
    hold: 'the ping lingers longer',
    siblingLink: { verb: 'drops a signal buoy with half its ring', siblingId: SIGNAL_BUOY },
  },
  [FLARE_MORTAR]: {
    secondTap: 'lobs the shell backward, away from the drill',
    hold: 'lobs the shell farther',
    siblingLink: { verb: 'pings the echo sounder at half radius', siblingId: ECHO_SOUNDER },
  },
  [SIGNAL_BUOY]: {
    secondTap: 'drops the buoy one ring ahead of the drill',
    hold: 'drops the buoy one ring behind you, away from the drill',
    siblingLink: { verb: 'lobs a flare that maps half as wide', siblingId: FLARE_MORTAR },
  },
  'passive.threat_periscope': {
    siblingLink: {
      verb: 'a lunge warning pings the echo sounder at half radius',
      siblingId: ECHO_SOUNDER,
    },
  },
  'passive.assay_lens': {
    siblingLink: {
      verb: 'breaking into ore drops a signal buoy with half its ring',
      siblingId: SIGNAL_BUOY,
    },
  },
  'passive.hazard_barometer': {
    siblingLink: {
      verb: 'a new hazard ahead of the drill lobs a flare that maps half as wide',
      siblingId: FLARE_MORTAR,
    },
  },
}

/** The item's milestones: its class's pattern at each Mark it has a verb for; none for a held one. */
export function sensingMilestonesOf(item: SensingItem): MarkMilestone[] {
  const verbs = VERBS[item.itemId]
  if (verbs === undefined) return []
  return milestonesOf(item.powerUpClass === 'passive' ? 'always-on' : item.powerUpClass, verbs)
}
