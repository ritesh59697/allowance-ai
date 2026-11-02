import { ShieldCheck } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { config } from '@/lib/near'
import { cn } from '@/lib/utils'

const LINKS = [
  { href: '/arena', label: 'Arena' },
  { href: '/owner', label: 'Owner' },
]

/** Shared top bar: home link, page links, the repo (when configured) and the network. */
export function SiteHeader() {
  const here = window.location.pathname.replace(/\/$/, '')
  const links = config.repoUrl ? [...LINKS, { href: config.repoUrl, label: 'GitHub' }] : LINKS
  return (
    <header className="flex items-center justify-between gap-3">
      <a
        href="/"
        className="flex items-center gap-2 rounded-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <ShieldCheck className="size-5 text-primary" aria-hidden />
        <span className="font-heading font-medium">Allowance</span>
      </a>
      <nav aria-label="Site" className="flex items-center gap-1">
        {links.map(({ href, label }) => (
          <a
            key={href}
            href={href}
            aria-current={here === href ? 'page' : undefined}
            className={cn(
              'rounded-sm px-2 py-1 text-sm text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50',
              here === href && 'text-foreground',
            )}
          >
            {label}
          </a>
        ))}
        <Badge variant="outline" className="ml-1 hidden font-mono uppercase sm:inline-flex">
          {config.network}
        </Badge>
      </nav>
    </header>
  )
}
