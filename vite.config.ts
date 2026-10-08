/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const packageVersion = (
  JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
    version: string
  }
).version

// A source archive without .git still builds; the run metadata then says "unknown".
function readBuildCommit(): string {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim()
  } catch {
    return 'unknown'
  }
}

// The pacing bot regressions take about 72% of the suite's time, too long for the 10-minute
// per-push CI job. `npm run test:push` (and that job) set SKIP_NIGHTLY_ONLY_TESTS=1 to leave them
// out; the nightly workflow and `npm test` always run them.
const NIGHTLY_ONLY_TESTS = [
  'src/logging/pacingGate.test.ts',
  'src/logging/assayPacingGate.test.ts',
  'src/logging/campaignPacingGate.test.ts',
  'src/systems/bot/playSlice.test.ts',
]
const skipsNightlyOnlyTests = process.env.SKIP_NIGHTLY_ONLY_TESTS === '1'

// Lanes (ticket 340): bot runs of hours, such as the P200 money lane, too long for the suite and
// the nightly. A `*.lane.test.ts` runs only when a CLI filter names it, as
// `npx vitest run src/logging/moneyPastP200.lane.test.ts` does.
const LANE_TESTS = '**/*.lane.test.ts'
const namesALane = process.argv.some((arg) => arg.includes('.lane'))
// The bot session keeps every command and domain event it played, about 14 MB a game hour (measured
// on the P8 run for ticket 340), so the P200 lane holds about 3 GB by its end: a named lane run
// gets a worker heap above Node's default.
const LANE_HEAP_MEGABYTES = 6144

export default defineConfig({
  plugins: [react()],
  define: {
    __GAME_VERSION__: JSON.stringify(packageVersion),
    __BUILD_COMMIT__: JSON.stringify(readBuildCommit()),
  },
  // Relative asset URLs: Electron loads dist/index.html from file://, where "/assets/..." would
  // point at the filesystem root. The browser build is unaffected.
  base: './',
  server: {
    port: 5173,
    // electron:dev waits on this exact port.
    strictPort: true,
    watch: { ignored: ['**/.claude/**', '**/logs/**', '**/dist-electron/**'] },
  },
  test: {
    // vitest owns the fast headless tests (node, no DOM, no canvas; only physics-layer specs build a
    // Rapier world, see docs/TESTING_INSTRUCTIONS.md).
    include: ['src/**/*.test.ts', 'scripts/**/*.test.mjs'],
    setupFiles: ['src/testSetup.ts'],
    ...(namesALane
      ? { poolOptions: { forks: { execArgv: [`--max-old-space-size=${LANE_HEAP_MEGABYTES}`] } } }
      : {}),
    exclude: [
      '**/node_modules/**',
      'dist/**',
      'dist-electron/**',
      '.claude/**',
      ...(skipsNightlyOnlyTests ? NIGHTLY_ONLY_TESTS : []),
      ...(namesALane ? [] : [LANE_TESTS]),
    ],
  },
})
