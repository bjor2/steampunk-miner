/**
 * The field-line layer's draw budget (GD ruling on #293 Q1, option (a)): one `LineSegments`, one
 * draw call, at most 63 arcs, drawn only on magnetic planets. #213's `SCENE_LAYER_LINE` took its
 * first measured raise for it, 1024 to 1088 instances (the slice bench in `npm run bench:render`).
 */
export const FIELD_ARC_CAP = 63

export const FIELD_ARC_LAYER_BUDGET = { drawCalls: 1, instances: FIELD_ARC_CAP } as const
