/**
 * The mobility items' Mark milestones (ticket 275, the GD lock on #256): the verb each item's
 * Marks 3, 6 and 9 bring, placed by its class (charged items and consumables: second tap, hold,
 * link; the rivet patch, a channel: second tap, link, then a number step; the toggles: hold,
 * second tap, link). The words are the #164 card's milestone line ("Mk III, tap twice: …").
 *
 * Every link names a sibling in this lane that counts charges, since one that counts none never
 * fires (ticket 274). The steam boost's, the grapple's and the steam shield's are the lock's worked
 * examples; the rest are this ticket's picks. None of these items moves ore, so none yields.
 */
import { milestonesOf, type MarkMilestone } from '../../tech-tree'
import { MOBILITY_ITEM, type MobilityItemId } from './itemIds'

const I = MOBILITY_ITEM

export const MOBILITY_MILESTONES: Readonly<Record<MobilityItemId, readonly MarkMilestone[]>> = {
  [I.grappleWinch]: milestonesOf('charged', {
    secondTap: 'fires again at the next anchor past the one it holds',
    hold: 'reels in faster',
    siblingLink: { verb: 'fires the steam boost at half burn', siblingId: I.steamBoost },
  }),
  [I.emergencyBallast]: milestonesOf('consumable', {
    secondTap: 'the drop kicks the miner up a short hop',
    hold: 'stays light for longer',
    siblingLink: { verb: 'fires the grapple at half range', siblingId: I.grappleWinch },
  }),
  [I.heatSinkFlask]: milestonesOf('consumable', {
    secondTap: 'the vent jets out ahead and shoves the miner',
    hold: 'a longer pause, after the first',
    siblingLink: {
      verb: 'the vented steam hangs as a half steam shield',
      siblingId: I.steamShield,
    },
  }),
  [I.steamBoost]: milestonesOf('charged', {
    secondTap: 'a sideways air-dash',
    hold: 'a longer burn',
    siblingLink: {
      verb: 'drops an emergency ballast at half its lift',
      siblingId: I.emergencyBallast,
    },
  }),
  [I.rivetPatch]: milestonesOf('channel', {
    secondTap: 'a second plate rides the same hold',
    siblingLink: { verb: 'a half steam shield while the plate sets', siblingId: I.steamShield },
  }),
  [I.steamShield]: milestonesOf('charged', {
    secondTap: 'a cooling curtain: heat climbs at half rate',
    hold: 'the curtain stands longer',
    siblingLink: {
      verb: 'its break bursts a small smoke puff at half reach',
      siblingId: I.smokeCanister,
    },
  }),
  [I.smokeCanister]: milestonesOf('consumable', {
    secondTap: 'thrown ahead, the cloud bursts where the miner faces',
    hold: 'the cloud lingers longer',
    siblingLink: { verb: 'fires the steam boost at half burn', siblingId: I.steamBoost },
  }),
  [I.gravAnchor]: milestonesOf('toggle', {
    hold: 'a hard pin: holds even in open air for a second',
    secondTap: 'kicks off, away from the face it grips',
    siblingLink: { verb: 'sets a rivet patch at half plate', siblingId: I.rivetPatch },
  }),
  [I.buoyancyTanks]: milestonesOf('toggle', {
    hold: 'a fast rise for a second',
    secondTap: 'a quick drift: drives faster for a second',
    siblingLink: {
      verb: 'drops an emergency ballast at half its lift',
      siblingId: I.emergencyBallast,
    },
  }),
  [I.escapeThruster]: milestonesOf('consumable', {
    secondTap: 'aimed the way the miner faces',
    hold: 'a longer burn',
    siblingLink: { verb: 'leaves a small smoke puff at half reach', siblingId: I.smokeCanister },
  }),
}
