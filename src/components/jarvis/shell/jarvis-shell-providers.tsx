"use client"

// JarvisShellProviders bundles the four contexts the shell needs:
//   - SidebarCollapseContext  : 240/56 toggle, persisted to localStorage
//   - PersonaContext          : currently-selected persona id, persisted
//   - VersionContext           : git sha + semver pill (read once on mount)
//   - BudgetContext            : token budget readout (mock for now; real later)
//
// We intentionally keep these in one file so consumers can grab the hook they
// need without 4 imports. W3B/W3C/W4A/W4C should read these via the named hooks.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"

/* -------------------------------------------------------------------------- */
/*                            Sidebar collapse state                           */
/* -------------------------------------------------------------------------- */

interface SidebarCollapseValue {
  collapsed: boolean
  toggle: () => void
  setCollapsed: (v: boolean) => void
}

const SidebarCollapseContext = createContext<SidebarCollapseValue>({
  collapsed: false,
  toggle: () => {},
  setCollapsed: () => {},
})

export const useSidebarCollapse = (): SidebarCollapseValue =>
  useContext(SidebarCollapseContext)

/* -------------------------------------------------------------------------- */
/*                                  Persona                                    */
/* -------------------------------------------------------------------------- */

export interface JarvisPersona {
  id: string
  name: string
  emoji?: string | null
  color?: string | null
}

interface PersonaValue {
  persona: JarvisPersona | null
  setPersona: (p: JarvisPersona | null) => void
  loading: boolean
  refresh: () => Promise<void>
}

const PersonaContext = createContext<PersonaValue>({
  persona: null,
  setPersona: () => {},
  loading: true,
  refresh: async () => {},
})

export const usePersona = (): PersonaValue => useContext(PersonaContext)

/* -------------------------------------------------------------------------- */
/*                                  Version                                    */
/* -------------------------------------------------------------------------- */

interface VersionValue {
  sha: string
  version: string
}

const VersionContext = createContext<VersionValue>({ sha: "dev", version: "0.4.1" })

export const useJarvisVersion = (): VersionValue => useContext(VersionContext)

/* -------------------------------------------------------------------------- */
/*                                   Budget                                    */
/* -------------------------------------------------------------------------- */

interface BudgetValue {
  used: number
  total: number
  setBudget: (used: number, total: number) => void
}

const BudgetContext = createContext<BudgetValue>({
  used: 1840,
  total: 4000,
  setBudget: () => {},
})

export const useTokenBudget = (): BudgetValue => useContext(BudgetContext)

/* -------------------------------------------------------------------------- */
/*                                 Provider                                    */
/* -------------------------------------------------------------------------- */

const SIDEBAR_KEY = "jarvis.sidebar.collapsed"
const PERSONA_KEY = "jarvis.persona.id"
const TOKENS_KEY = "jarvis.tokens"

interface JarvisShellProvidersProps {
  children: ReactNode
}

export function JarvisShellProviders({ children }: JarvisShellProvidersProps) {
  /* --- sidebar collapse --- */
  const [collapsed, setCollapsedState] = useState<boolean>(false)

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(SIDEBAR_KEY)
      if (stored === "1") setCollapsedState(true)
    } catch {
      /* localStorage may be blocked; ignore */
    }
  }, [])

  const setCollapsed = useCallback((v: boolean) => {
    setCollapsedState(v)
    try {
      window.localStorage.setItem(SIDEBAR_KEY, v ? "1" : "0")
    } catch {
      /* ignore */
    }
  }, [])

  const toggleSidebar = useCallback(() => {
    setCollapsedState((prev) => {
      const next = !prev
      try {
        window.localStorage.setItem(SIDEBAR_KEY, next ? "1" : "0")
      } catch {
        /* ignore */
      }
      return next
    })
  }, [])

  /* --- persona --- */
  const [persona, setPersonaState] = useState<JarvisPersona | null>(null)
  const [personaLoading, setPersonaLoading] = useState<boolean>(true)

  const loadPersona = useCallback(async () => {
    setPersonaLoading(true)
    try {
      const storedId =
        typeof window !== "undefined"
          ? window.localStorage.getItem(PERSONA_KEY)
          : null
      const res = await fetch("/api/personas", { cache: "no-store" })
      if (!res.ok) throw new Error(`personas ${res.status}`)
      const data = (await res.json()) as { personas?: JarvisPersona[] }
      const list = data.personas ?? []
      if (list.length === 0) {
        setPersonaState(null)
        return
      }
      const match = storedId ? list.find((p) => p.id === storedId) : null
      setPersonaState(match ?? list[0])
    } catch {
      // /api/personas may not exist or may 401; fall back to a sensible default
      setPersonaState({ id: "default", name: "Dylan", emoji: null, color: null })
    } finally {
      setPersonaLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadPersona()
  }, [loadPersona])

  const setPersona = useCallback((p: JarvisPersona | null) => {
    setPersonaState(p)
    try {
      if (p) window.localStorage.setItem(PERSONA_KEY, p.id)
      else window.localStorage.removeItem(PERSONA_KEY)
    } catch {
      /* ignore */
    }
  }, [])

  /* --- version --- */
  const versionValue = useMemo<VersionValue>(() => {
    const sha =
      (typeof process !== "undefined" &&
        process.env?.NEXT_PUBLIC_GIT_SHA?.slice(0, 7)) ||
      "dev"
    const version = process.env?.NEXT_PUBLIC_JARVIS_VERSION ?? "0.4.1"
    return { sha, version }
  }, [])

  /* --- budget --- */
  const [budget, setBudgetState] = useState<{ used: number; total: number }>({
    used: 1840,
    total: 4000,
  })

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(TOKENS_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw) as { used?: number; total?: number }
      if (
        typeof parsed.used === "number" &&
        typeof parsed.total === "number" &&
        parsed.total > 0
      ) {
        setBudgetState({ used: parsed.used, total: parsed.total })
      }
    } catch {
      /* ignore */
    }
  }, [])

  const setBudget = useCallback((used: number, total: number) => {
    setBudgetState({ used, total })
    try {
      window.localStorage.setItem(
        TOKENS_KEY,
        JSON.stringify({ used, total })
      )
    } catch {
      /* ignore */
    }
  }, [])

  /* --- assemble --- */
  const sidebarValue = useMemo<SidebarCollapseValue>(
    () => ({ collapsed, toggle: toggleSidebar, setCollapsed }),
    [collapsed, toggleSidebar, setCollapsed]
  )
  const personaValue = useMemo<PersonaValue>(
    () => ({
      persona,
      setPersona,
      loading: personaLoading,
      refresh: loadPersona,
    }),
    [persona, setPersona, personaLoading, loadPersona]
  )
  const budgetValue = useMemo<BudgetValue>(
    () => ({ used: budget.used, total: budget.total, setBudget }),
    [budget.used, budget.total, setBudget]
  )

  return (
    <SidebarCollapseContext.Provider value={sidebarValue}>
      <PersonaContext.Provider value={personaValue}>
        <VersionContext.Provider value={versionValue}>
          <BudgetContext.Provider value={budgetValue}>
            {children}
          </BudgetContext.Provider>
        </VersionContext.Provider>
      </PersonaContext.Provider>
    </SidebarCollapseContext.Provider>
  )
}
