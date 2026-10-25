/**
 * Points that hold one cluster asset many items extend: the cab gauge cluster, whose owned gauges
 * are dial variants (TD after the Horizontal Scaler review), and the charge rack, whose consumable
 * crates and flare mortar ride it (TD sockets table; G&V mortar pick, #162). A leaf of its own, so
 * the content registry's seal reads it without importing the coverage rule.
 */
import type { AttachId } from './vehicleAttach'

export const SHARED_ATTACH_IDS: readonly AttachId[] = ['cab.gauge', 'hull.rear']
