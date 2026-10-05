/**
 * Loads a final asset's KTX2 atlas (#52 "Formats", three.js `KTX2Loader`). One loader for the
 * game: R3F memoises it per class and caches each map by URL, so every part of an asset shares one
 * texture. Suspends while the map transcodes; callers wrap it in a `Suspense`.
 */
import { useLoader, useThree } from '@react-three/fiber'
import type { Texture, WebGLRenderer } from 'three'
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js'
import type { AtlasMaps } from '../systems/art/assetLook'

/**
 * The Basis transcoder that ships with three (r169), copied into `public/basis/` because the
 * loader fetches it by folder. Relative to the page, so it resolves from file:// in Electron too.
 */
const BASIS_TRANSCODER_FOLDER = 'basis/'

function configureLoader(loader: KTX2Loader, gl: WebGLRenderer): void {
  loader.setTranscoderPath(BASIS_TRANSCODER_FOLDER).detectSupport(gl)
}

/** The atlas's base colour, with the part mask in alpha. */
export function useAtlasAlbedo(maps: AtlasMaps): Texture {
  const gl = useThree((state) => state.gl)
  return useLoader(KTX2Loader, maps.albedo, (loader) => configureLoader(loader, gl))
}

/** The atlas's normal map for lit 2.5D shading (#38, #48). */
export function useAtlasNormal(maps: AtlasMaps): Texture {
  const gl = useThree((state) => state.gl)
  return useLoader(KTX2Loader, maps.normal, (loader) => configureLoader(loader, gl))
}

/**
 * The atlas's emissive map, or null when the sidecar has none. Hooks must stay unconditional, so
 * callers that may lack an emissive map use `useAtlasAlbedo`/`useAtlasNormal` only and skip this.
 */
export function useAtlasEmissive(maps: AtlasMaps & { emissive: string }): Texture {
  const gl = useThree((state) => state.gl)
  return useLoader(KTX2Loader, maps.emissive, (loader) => configureLoader(loader, gl))
}
