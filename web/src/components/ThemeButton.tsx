import { Monitor, Moon, Sun } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { THEME_PREFS, readPref, setPref, type ThemePref } from '@/lib/theme'

const LOOK: Record<ThemePref, { icon: typeof Sun; label: string }> = {
  system: { icon: Monitor, label: 'System' },
  light: { icon: Sun, label: 'Light' },
  dark: { icon: Moon, label: 'Dark' },
}

/** One button that steps through system, light and dark. */
export function ThemeButton() {
  const [pref, setPrefState] = useState(readPref)
  const next = THEME_PREFS[(THEME_PREFS.indexOf(pref) + 1) % THEME_PREFS.length]
  const { icon: Icon, label } = LOOK[pref]
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      className="text-muted-foreground hover:text-foreground"
      aria-label={`Theme: ${label}. Switch to ${LOOK[next].label.toLowerCase()}`}
      title={`Theme: ${label}`}
      onClick={() => {
        setPref(next)
        setPrefState(next)
      }}
    >
      <Icon strokeWidth={1.5} aria-hidden />
    </Button>
  )
}
