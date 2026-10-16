/**
 * The HUD's boxes (#500 TD shape 4.1): every element that takes screen area over the play view
 * carries `data-hud="<id>"` on its root, so the layout specs measure each box, check that no two
 * overlap and add up how much of the view they cover. Full-screen wrappers carry none; the
 * transparent stick zone carries `data-hud-zone="stick"`, a keep-out that covers nothing.
 * This table is the one list the components and the specs read.
 */
export const HUD_BOX_IDS = {
  gauges: 'gauges',
  status: 'status',
  readouts: 'readouts',
  techTree: 'tech-tree',
  hint: 'hint',
  transmission: 'transmission',
  prompts: 'prompts',
  threat: 'threat',
  control: 'control',
} as const

export type HudBoxId = (typeof HUD_BOX_IDS)[keyof typeof HUD_BOX_IDS]

/** The attribute a box's root carries, and the stick zone's keep-out attribute. */
export const HUD_BOX_ATTRIBUTE = 'data-hud'
export const HUD_ZONE_ATTRIBUTE = 'data-hud-zone'
export const STICK_ZONE_ID = 'stick'

/** The root attribute of one HUD box, spread onto its element. */
export function hudBoxOf(id: HudBoxId): { [HUD_BOX_ATTRIBUTE]: HudBoxId } {
  return { [HUD_BOX_ATTRIBUTE]: id }
}
