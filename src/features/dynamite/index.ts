/**
 * The dynamite slice's public API (feature-slices.md 2.1): the only file another slice may import
 * from this folder. The size numbers are the kernel's (`blastingCharges.sizes`, K8 #218), passed
 * through here for #148 (gates) and #215 (looks) so they read one ladder, never a copy.
 */
export const DYNAMITE_SLICE_ID = 'dynamite'
export {
  chargeSpec,
  minChargeFor,
  type ChargeSpec,
  type DynamiteGatedCell,
} from '../../systems/economy/chargeSizes'
export {
  dynamiteSizeIconIdOf,
  dynamiteSizeIdOf,
  REMOTE_DETONATOR_ROW_ID,
  type DynamiteSize,
} from './systems/dynamiteSizes'
