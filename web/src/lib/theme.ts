// The site theme. A preference (system, light or dark) is kept in
// localStorage; the resolved theme lives on <html data-theme>, which the
// tokens in index.css read. The inline script in index.html applies the
// same rule before first paint, so keep THEME_KEY and resolve() in step
// with it.
import { useSyncExternalStore } from 'react'
import { load, save } from './storage'

export type ThemePref = 'system' | 'light' | 'dark'
export type Theme = 'light' | 'dark'

export const THEME_KEY = 'theme'
export const THEME_PREFS: ThemePref[] = ['system', 'light', 'dark']

const lightQuery = () => window.matchMedia('(prefers-color-scheme: light)')

export function readPref(): ThemePref {
  const stored = load<ThemePref>(THEME_KEY)
  return stored && THEME_PREFS.includes(stored) ? stored : 'system'
}

function resolve(pref: ThemePref): Theme {
  return pref === 'system' ? (lightQuery().matches ? 'light' : 'dark') : pref
}

function apply(pref: ThemePref) {
  const root = document.documentElement
  root.dataset.theme = resolve(pref)
  // The browser chrome takes the page's own background
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
  const bg = getComputedStyle(root).getPropertyValue('--background').trim()
  if (meta && bg) meta.content = bg
}

export function setPref(pref: ThemePref) {
  save(THEME_KEY, pref)
  apply(pref)
}

/** Applies the saved preference and follows the system while it is "system". */
export function initTheme() {
  apply(readPref())
  lightQuery().addEventListener('change', () => {
    if (readPref() === 'system') apply('system')
  })
}

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
  return () => observer.disconnect()
}

/** The theme on screen now: light or dark, whatever the preference. */
export function useTheme(): Theme {
  return useSyncExternalStore(
    subscribe,
    () => (document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'),
    () => 'dark',
  )
}
