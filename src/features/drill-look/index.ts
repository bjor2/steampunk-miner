/**
 * The drill look slice's public API (docs/standards/feature-slices.md 2.1): the threshold table
 * and the pure stage rule. Never React, zustand or a store object.
 */
export const DRILL_LOOK_SLICE_ID = 'drill-look'
export type { DrillLookStep } from './systems/render/drillLookSteps'
export { DRILL_LOOK_STEPS, drillLookStageOf } from './systems/render/drillLookSteps'
