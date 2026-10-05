/**
 * How the Upgrade bay preview frames the vehicle on screen, written by its camera each frame
 * (#39, #44), so the debug API can report the framing the player sees: the panel's size, the
 * camera's pixels per metre and the share of the panel height the visual vehicle covers. Zero
 * while no preview is open.
 */
export const previewPresence = {
  panelWidthPixels: 0,
  panelHeightPixels: 0,
  pixelsPerMetre: 0,
  vehicleShare: 0,
}
