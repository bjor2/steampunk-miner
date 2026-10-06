/**
 * Build identity, injected by vite.config.ts. Balance statistics from different builds cannot be
 * compared unless every run records both (design doc section 24).
 */
declare const __GAME_VERSION__: string
declare const __BUILD_COMMIT__: string

export const GAME_VERSION: string = __GAME_VERSION__
export const BUILD_COMMIT: string = __BUILD_COMMIT__

/** The dev server's build: missing icons draw in magenta and warn (#158, feature-slices.md 3.4). */
export const IS_DEV_BUILD: boolean = import.meta.env.DEV
