/**
 * Balance numbers that are not economy data. Prices, ratios, hardness and every other #6 constant
 * live in `src/systems/economy/economy.json`; change a number here when the design does, never to
 * satisfy a test.
 */

/**
 * Energy is stored as an integer count of quanta, 240 per unit (decision #11 amendment 2), so
 * drilling (4 per tick), thrust (6) and driving (1) are exact; run metadata records it.
 */
export const ENERGY_QUANTA_PER_UNIT = 240
