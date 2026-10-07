import { describe, expect, it } from 'vitest'
import { newestOf, previewBuildChoice } from './previewBuild.mjs'

const SOURCE = { path: 'src/main.tsx', mtimeMs: 2_000 }

describe('e2e: preview build', () => {
  it('builds when there is no dist/', () => {
    expect(previewBuildChoice(undefined, SOURCE)).toEqual({
      isBuildNeeded: true,
      reason: 'dist/index.html is missing',
    })
  })

  it('builds when a build input changed after dist/ was built', () => {
    expect(previewBuildChoice(1_000, SOURCE)).toEqual({
      isBuildNeeded: true,
      reason: 'src/main.tsx is newer than dist/',
    })
  })

  it('reuses a dist/ built after every build input', () => {
    expect(previewBuildChoice(3_000, SOURCE).isBuildNeeded).toBe(false)
  })

  it('finds the newest input by modification time', () => {
    const inputs = [SOURCE, { path: 'index.html', mtimeMs: 5_000 }, { path: 'a', mtimeMs: 10 }]
    expect(newestOf(inputs)).toEqual({ path: 'index.html', mtimeMs: 5_000 })
  })
})
