// The CI soak's job-summary row (#103): one Markdown table row per run, read from summary.json, so
// the workflow page shows the verdict and the numbers behind it without opening an artifact. A run
// that wrote no summary (the soak could not run) still gets a FAIL line.
// Pure: summary object (or null) in, Markdown out.

const HEADER = [
  '| Gate | Target | Cycles | Heap first / peak / last (MB) | Gate growth (MB) | Geometries | Textures | Colliders | Page errors |',
  '| ---- | ------ | -----: | ----------------------------- | ---------------: | ---------- | -------- | --------- | ----------: |',
]

/** summary.json -> the job summary's heading, table and failure list; null -> the run never finished. */
export function formatSoakJobSummary(summary) {
  if (summary === null) return describeMissingSummary()
  return [
    '### Memory soak',
    '',
    ...HEADER,
    formatSoakRow(summary),
    ...listFailureLines(summary.failures),
    '',
  ].join('\n')
}

function describeMissingSummary() {
  return [
    '### Memory soak',
    '',
    '**FAIL**: the soak wrote no summary.json, so it could not run to the end (see the job log).',
    '',
  ].join('\n')
}

function formatSoakRow(summary) {
  const heap = [summary.heapFirstBoundaryMB, summary.peakUsedJSHeapMB, summary.heapLastBoundaryMB]
  const cells = [
    `**${summary.gate}**`,
    summary.target,
    summary.cycles,
    heap.map(formatMegabytes).join(' / '),
    formatGrowth(summary.heapGateGrowthMB),
    formatFirstLast(summary.geometriesFirstLast),
    formatFirstLast(summary.texturesFirstLast),
    formatFirstLast(summary.collidersFirstLast),
    summary.pageErrorCount,
  ]
  return `| ${cells.join(' | ')} |`
}

function listFailureLines(failures) {
  if (failures.length === 0) return []
  return ['', ...failures.map((failure) => `- ${failure.replace(/\|/g, '\\|')}`)]
}

function formatMegabytes(megabytes) {
  return megabytes.toFixed(1)
}

/** Null while too few cycles settled for the heap rule. */
function formatGrowth(megabytes) {
  if (megabytes === null) return 'n/a'
  return `${megabytes >= 0 ? '+' : ''}${megabytes.toFixed(1)}`
}

function formatFirstLast([first, last]) {
  return `${first} → ${last}`
}
