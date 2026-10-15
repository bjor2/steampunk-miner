/**
 * The one scroll container (spec #422 ruling 3, TD ruling on #424): no browser-default scrollbar
 * anywhere. Only the shared steampunk scroll area's sheet may set `overflow: auto|scroll|overlay`
 * or style the native scrollbar; anywhere else each such declaration is a finding against the
 * panel that owns the file. Pure: it reads source text the caller hands it.
 */

/** The shared scroll area's sheet (build #423): the only place a box scrolls. */
export const SHARED_SCROLL_SHEET = 'src/ui/kit/ScrollArea.module.css'

export interface SourceText {
  /** The repo path, `src/...`. */
  readonly path: string
  readonly text: string
}

export interface ScrollFinding {
  readonly path: string
  /** 1-based. */
  readonly line: number
  readonly declaration: string
}

const CSS_SCROLL_DECLARATIONS = [
  /\boverflow(?:-[xy])?\s*:[^;}]*\b(?:auto|scroll|overlay)\b/,
  /\bscrollbar-(?:width|color|gutter)\s*:/,
  /::-webkit-scrollbar/,
]

const INLINE_SCROLL_DECLARATIONS = [
  /\boverflow[XY]?\s*:\s*['"`](?:auto|scroll|overlay)\b/,
  /\bscrollbar(?:Width|Color|Gutter)\s*:/,
]

/** Every scroll or native-scrollbar declaration outside the shared scroll area's sheet. */
export function scrollFindingsOf(sources: readonly SourceText[]): ScrollFinding[] {
  return sources.filter(isOutsideSharedSheet).flatMap(scrollFindingsInFile)
}

function isOutsideSharedSheet(source: SourceText): boolean {
  return source.path !== SHARED_SCROLL_SHEET
}

function scrollFindingsInFile(source: SourceText): ScrollFinding[] {
  const patterns = isStyleSheet(source.path) ? CSS_SCROLL_DECLARATIONS : INLINE_SCROLL_DECLARATIONS
  return withoutComments(source.text)
    .split('\n')
    .flatMap((text, index) => findingsOnLine(source.path, index + 1, text, patterns))
}

function isStyleSheet(path: string): boolean {
  return path.endsWith('.css')
}

function findingsOnLine(
  path: string,
  line: number,
  text: string,
  patterns: readonly RegExp[],
): ScrollFinding[] {
  if (!patterns.some((pattern) => pattern.test(text))) return []
  return [{ path, line, declaration: text.trim() }]
}

/** Blanks block comments but keeps their newlines, so a finding's line number stays true. */
function withoutComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ' '))
}
