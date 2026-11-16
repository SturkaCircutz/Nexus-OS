import { createContext, useContext, useEffect, useLayoutEffect, useState, type ReactNode } from 'react'

export type Theme = 'light' | 'dark'
/** What the user picked. 'system' follows the OS setting. */
export type ThemeChoice = Theme | 'system'

interface ThemeContextValue {
  theme: Theme
  choice: ThemeChoice
  setTheme: (choice: ThemeChoice) => void
}

const STORAGE_KEY = 'nexus-theme'
const DARK_QUERY = '(prefers-color-scheme: dark)'

const systemTheme = (): Theme => (window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light')

function savedChoice(): ThemeChoice {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    return v === 'light' || v === 'dark' ? v : 'system'
  } catch {
    return 'system'
  }
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

/** Follows the system setting until the user picks a theme, then remembers that choice. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [choice, setChoice] = useState<ThemeChoice>(savedChoice)
  const [system, setSystem] = useState<Theme>(systemTheme)

  useEffect(() => {
    const mq = window.matchMedia(DARK_QUERY)
    const onChange = () => setSystem(mq.matches ? 'dark' : 'light')
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const theme = choice === 'system' ? system : choice

  // Before paint, so a dark-mode user never sees a light flash.
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  const setTheme = (next: ThemeChoice) => {
    setChoice(next)
    try {
      if (next === 'system') localStorage.removeItem(STORAGE_KEY)
      else localStorage.setItem(STORAGE_KEY, next)
    } catch {
      /* storage unavailable; the choice lasts for this visit only */
    }
  }

  return <ThemeContext.Provider value={{ theme, choice, setTheme }}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>')
  return ctx
}
