/**
 * The platform as the authority holds it (decisions #8 and #10): the core bay, a fragment count
 * shared by everyone in the session, and the visual state the platform shows. The slice has two
 * states: the plain `outpost`, and the `core_drive` that appears once the bay first holds the
 * fragments travel needs and stays for the rest of the run. Facilities have no levels (#8).
 */
export const PLATFORM_VISUAL_STATES = ['outpost', 'core_drive'] as const

export type PlatformVisualState = (typeof PLATFORM_VISUAL_STATES)[number]

/** The three facilities of #8, each at its one fixed level in the slice. */
export const FACILITY_IDS = ['shop', 'workshop', 'charging'] as const

export const FACILITY_LEVEL = 1

export interface PlatformState {
  coreBay: number
  visualState: PlatformVisualState
}

export const NEW_PLATFORM: PlatformState = { coreBay: 0, visualState: 'outpost' }

/**
 * Why `debug.setFacilityLevel(id, level)` cannot apply (#8 registered ids): an unknown facility,
 * or any level but the one each facility has in the slice. Level 1 is accepted and changes nothing.
 */
export function facilityLevelProblems(facilityId: unknown, level: unknown): string[] {
  return [
    ...((FACILITY_IDS as readonly unknown[]).includes(facilityId)
      ? []
      : [`${JSON.stringify(facilityId)} is not a facility (${FACILITY_IDS.join(', ')})`]),
    ...(level === FACILITY_LEVEL
      ? []
      : [`facilities have no levels in the slice: level must be 1, got ${JSON.stringify(level)}`]),
  ]
}

export function isPlatformVisualState(value: unknown): value is PlatformVisualState {
  return (PLATFORM_VISUAL_STATES as readonly unknown[]).includes(value)
}
