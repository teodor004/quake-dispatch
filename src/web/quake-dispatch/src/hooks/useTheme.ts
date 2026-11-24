import { useSyncExternalStore } from 'react'

export type Theme = 'light' | 'dark'

const THEME_STORAGE_KEY = 'quake-dispatch-theme'
const listeners = new Set<() => void>()

function read(): Theme {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'
}

export function setTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    // Storage blocked: the choice still applies for this visit.
  }
  listeners.forEach((l) => l())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Current theme; the initial value is set in index.html before the first paint. */
export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, read)
}
