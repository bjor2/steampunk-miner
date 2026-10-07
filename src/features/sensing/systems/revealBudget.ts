/**
 * What the reveal layer may draw (the TD lock on #203 Q1): one pooled `InstancedMesh`, one draw
 * call, a quad per marked cell or buoy pin, inside #213's `SCENE_LAYER_LINE` of 1024 instances.
 * The lock allows up to 384; the dynamite visuals (681) and the rig's power-up effects (256,
 * ticket 250) leave 87, so the layer takes those 87 until the TD moves the line or the pools.
 * Buoy pins hold seats of their own, so a busy echo never evicts a pin someone else dropped.
 */
export const REVEAL_LAYER_BUDGET = { drawCalls: 1, instances: 87 } as const

/** The most buoy pins drawn at once; the oldest pin leaves for a new one. */
export const BUOY_PIN_CAP = 7

/** The most marked cells drawn at once: a ping past it keeps its nearest cells. */
export const REVEAL_MARK_CAP = REVEAL_LAYER_BUDGET.instances - BUOY_PIN_CAP
