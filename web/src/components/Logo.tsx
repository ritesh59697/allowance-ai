/**
 * The Allowance mark: a capital A whose crossbar runs past both legs, a limit
 * line the agent can't step over. Drawn in currentColor. public/favicon.svg
 * holds the same paths on a dark tile.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path d="M5 21L12 3.5 19 21" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square" />
      <path d="M1.5 15h21" stroke="currentColor" strokeWidth="2.5" />
    </svg>
  )
}
