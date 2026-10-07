// The time a Playwright run took, per phase and per spec (#190), from its JSON report
// (e2e-report/results.json on CI): the numbers a before/after comparison posts. Pure.

/** `{ totalMs, beforeFirstTestMs, testsWallMs, summedTestMs, flaky, failed, specs }` of a report. */
export function e2eTimingsOf(report) {
  const tests = testsOfSuites(report.suites)
  const runStartMs = Date.parse(report.stats.startTime)
  const span = spanOfResults(tests.flatMap((test) => test.results))
  return {
    totalMs: report.stats.duration,
    beforeFirstTestMs: span.startMs - runStartMs,
    testsWallMs: span.endMs - span.startMs,
    summedTestMs: summedDurationOf(tests),
    flaky: report.stats.flaky,
    failed: report.stats.unexpected,
    specs: specTimingsOf(tests),
  }
}

/** Every test (one per project) under the suites, each with the file of its spec. */
function testsOfSuites(suites) {
  return suites.flatMap((suite) => [
    ...suite.specs.flatMap((spec) => spec.tests.map((test) => ({ ...test, file: spec.file }))),
    ...testsOfSuites(suite.suites ?? []),
  ])
}

function spanOfResults(results) {
  const starts = results.map((result) => Date.parse(result.startTime))
  const ends = results.map((result) => Date.parse(result.startTime) + result.duration)
  return { startMs: Math.min(...starts), endMs: Math.max(...ends) }
}

function summedDurationOf(tests) {
  return tests.flatMap((test) => test.results).reduce((sum, result) => sum + result.duration, 0)
}

function specTimingsOf(tests) {
  const files = [...new Set(tests.map((test) => test.file))]
  return files
    .map((file) =>
      specTimingOf(
        file,
        tests.filter((test) => test.file === file),
      ),
    )
    .sort((a, b) => b.summedTestMs - a.summedTestMs)
}

function specTimingOf(file, tests) {
  const span = spanOfResults(tests.flatMap((test) => test.results))
  return {
    file,
    tests: tests.length,
    summedTestMs: summedDurationOf(tests),
    wallMs: span.endMs - span.startMs,
    failed: tests.filter((test) => test.status === 'unexpected').length,
    flaky: tests.filter((test) => test.status === 'flaky').length,
  }
}

const seconds = (ms) => `${(ms / 1000).toFixed(1)} s`

/** The timings as the two Markdown tables of the #190 measurement comment. */
export function formatE2eTimings(timings) {
  return [...phaseTableOf(timings), '', ...specTableOf(timings.specs)].join('\n')
}

function phaseTableOf(timings) {
  return [
    '| Phase | Time |',
    '| --- | --- |',
    `| Before the first test (webServer: build + preview start) | ${seconds(timings.beforeFirstTestMs)} |`,
    `| Tests, wall clock | ${seconds(timings.testsWallMs)} |`,
    `| **Playwright total** | **${seconds(timings.totalMs)}** |`,
    `| Sum of all test durations (serial equivalent) | ${seconds(timings.summedTestMs)} |`,
    `| Failed / flaky tests | ${timings.failed} / ${timings.flaky} |`,
  ]
}

function specTableOf(specs) {
  return [
    '| Spec | Tests | Summed test time | Wall span | Failed | Flaky |',
    '| --- | --- | --- | --- | --- | --- |',
    ...specs.map(
      (spec) =>
        `| \`${spec.file}\` | ${spec.tests} | ${seconds(spec.summedTestMs)} | ${seconds(spec.wallMs)} | ${spec.failed} | ${spec.flaky} |`,
    ),
  ]
}
