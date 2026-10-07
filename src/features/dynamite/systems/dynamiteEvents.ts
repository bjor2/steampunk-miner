/**
 * The command, domain event and rejection reasons `dynamite` adds (feature-slices.md 3.15), by
 * augmentation, never by editing the kernel's lists.
 *
 * The plunger (#153 amendment 2, the #189 and #149 locks): `dynamite.detonate_charge {}` fires the
 * caller's one live charge. Fired from within radius + 1 tile it is answered, not rejected, with
 * `dynamite.DetonateRefused {reason: in_radius}` and the charge stays live, like the loadout's
 * `EquipRefused`, so the run log says why the plunger only clunked.
 */
declare module '../../../systems/authority/authorityCommand' {
  interface CommandPayloads {
    /** Payload `{}`: one live charge per vehicle, so no charge id (TD lock on #189). */
    'dynamite.detonate_charge': Record<string, never>
  }
}

declare module '../../../systems/authority/domainEvent' {
  interface DomainEventBodies {
    'dynamite.DetonateRefused': { reason: DetonateRefusal; size: number }
  }
  interface RejectionReasons {
    /** `remote_detonator` (Schedule C, P22) is not open on this planet. */
    'dynamite.detonator_locked': true
    /** The caller has no live charge to fire. */
    'dynamite.no_live_charge': true
  }
}

/** Why the plunger clunked: the planter stands within the blast's radius + 1 tile (#153). */
export type DetonateRefusal = 'in_radius'
