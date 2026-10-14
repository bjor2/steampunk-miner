/**
 * The magnet fields' draw budget (GD and TD rulings on #286 Q1, option (a)): one `LineSegments`,
 * one draw call, at most 40 pieces, sized for the capped largest fields. One player's full set is
 * 34: the beacon's 8 arcs, the coil's ring and 8 flares, and the clamp's lattice over up to 8
 * pinned cells with struts on up to 9 braced blocks (ring 1). #213's `SCENE_LAYER_LINE` took its
 * second measured raise for it, 1088 to 1128 instances (the slice bench in `npm run bench:render`).
 */
export const MAGNET_FIELD_CAP = 40

export const MAGNET_FIELD_LAYER_BUDGET = { drawCalls: 1, instances: MAGNET_FIELD_CAP } as const
