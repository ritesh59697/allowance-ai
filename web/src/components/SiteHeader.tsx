import { LogoMark } from '@/components/Logo'
import { NearMark } from '@/components/NearMark'
import { ThemeButton } from '@/components/ThemeButton'
import { config } from '@/lib/near'
import { cn } from '@/lib/utils'

const LINKS = [
  { href: '/arena', label: 'Arena' },
  { href: '/owner', label: 'Owner' },
]

const linkClass =
  'rounded-sm text-sm outline-none transition-colors duration-150 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50'

/** Page frame shared by every page: one width, one header, one footer. */
export function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 sm:px-6">{children}</main>
      <SiteFooter />
    </div>
  )
}

function SiteHeader() {
  const here = window.location.pathname.replace(/\/$/, '')
  const links = config.repoUrl ? [...LINKS, { href: config.repoUrl, label: 'GitHub' }] : LINKS
  return (
    <header className="sticky top-0 z-40 px-4 pt-4 sm:px-6">
      <div className="mx-auto flex h-12 w-full max-w-6xl items-center justify-between gap-4 rounded-full border bg-background/70 pr-2 pl-4 backdrop-blur-xl">
        <a href="/" className={cn(linkClass, 'flex items-center gap-2 font-medium text-foreground')}>
          <LogoMark className="size-[18px]" />
          <span className="text-base">Allowance</span>
        </a>
        <nav aria-label="Site" className="flex items-center gap-5">
          {links.map(({ href, label }) => (
            <a
              key={href}
              href={href}
              aria-current={here === href ? 'page' : undefined}
              className={cn(linkClass, here === href ? 'text-foreground' : 'text-muted-foreground')}
            >
              {label}
            </a>
          ))}
          <ThemeButton />
        </nav>
      </div>
    </header>
  )
}

function SiteFooter() {
  return (
    <footer className="mt-24 border-t">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-4 py-6 text-sm text-faint sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p className="flex items-center gap-2">
          <NearMark className="size-3.5 shrink-0 text-muted-foreground" />
          Built on NEAR for NEAR HACKATHON 2026, AI Security & Defense track
        </p>
        <p>Runs on NEAR {config.network}. No real funds.</p>
      </div>
    </footer>
  )
}
