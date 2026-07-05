/**
 * indiaProjection.ts
 * -----------------------------------------------------------------------------
 * Coordinate projection utilities to convert latitude & longitude into pixel
 * (x, y) coordinates matching the @svg-maps/india viewBox (0 0 612 696).
 *
 * Utilizes linear interpolation calibrated on the extreme coordinate points:
 * - Jammu & Kashmir (North): Lat ~37.0 -> y ~1.0
 * - Tamil Nadu (South): Lat ~8.1 -> y ~641.0
 * - Gujarat (West): Long ~68.1 -> x ~30.0
 * - Arunachal Pradesh (East): Long ~97.4 -> x ~586.0
 * -----------------------------------------------------------------------------
 */

export interface Point {
  x: number
  y: number
}

// Bounding box bounds for geographical projection
const MIN_LON = 68.1
const MAX_LON = 97.4
const MIN_LAT = 8.1
const MAX_LAT = 37.0

// Corresponding pixel coordinates in the @svg-maps/india viewBox
const X_MIN = 30.0
const X_MAX = 586.0
const Y_MIN = 1.0
const Y_MAX = 641.0

/**
 * Projects latitude and longitude coordinates into SVG pixel space.
 * 
 * @param latitude Geographic latitude (degrees North)
 * @param longitude Geographic longitude (degrees East)
 * @returns An object with x and y coordinates relative to the 612x696 viewBox.
 */
export function projectCoordinates(latitude: number, longitude: number): Point {
  // Clamp coordinates to the calibrated Indian bounding box to prevent rendering markers off-screen
  const lat = Math.min(MAX_LAT, Math.max(MIN_LAT, latitude))
  const lon = Math.min(MAX_LON, Math.max(MIN_LON, longitude))

  // Interpolate longitude to X
  const x = X_MIN + ((lon - MIN_LON) / (MAX_LON - MIN_LON)) * (X_MAX - X_MIN)
  
  // Interpolate latitude to Y (inverting Y because SVG coordinate Y=0 is at the top)
  const y = Y_MIN + ((MAX_LAT - lat) / (MAX_LAT - MIN_LAT)) * (Y_MAX - Y_MIN)

  return { x, y }
}
