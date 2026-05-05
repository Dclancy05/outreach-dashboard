"use client"

/**
 * Tab-scoped error boundary for the automations page. Wraps each of the 4
 * tabs (Overview / Your Automations / Live View / Maintenance) so a crash
 * in one tab doesn't take down the whole page — the user can switch to a
 * working tab and report the broken one.
 *
 * Phase F — replaces the previous "any error in any tab kills the page"
 * behavior. Sentry already captures the original error globally; this
 * boundary surfaces a friendly recovery UI in addition.
 */

import { Component, type ReactNode } from "react"
import { AlertTriangle, RotateCcw } from "lucide-react"
import * as Sentry from "@sentry/nextjs"

interface TabErrorBoundaryProps {
  /** Display label for the tab — surfaces in the error UI + Sentry breadcrumb */
  tabName: string
  children: ReactNode
}

interface TabErrorBoundaryState {
  error: Error | null
  /** Bumped by "Try again" so React re-mounts children. */
  resetKey: number
}

export class TabErrorBoundary extends Component<
  TabErrorBoundaryProps,
  TabErrorBoundaryState
> {
  state: TabErrorBoundaryState = { error: null, resetKey: 0 }

  static getDerivedStateFromError(error: Error): Partial<TabErrorBoundaryState> {
    return { error }
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    // Tag + breadcrumb so Sentry groups these per-tab automatically.
    try {
      Sentry.withScope((scope) => {
        scope.setTag("feature", "automations")
        scope.setTag("automations_tab", this.props.tabName)
        scope.addBreadcrumb({
          category: "automations",
          message: `crash in tab "${this.props.tabName}"`,
          level: "error",
        })
        scope.setExtra("componentStack", info.componentStack)
        Sentry.captureException(error)
      })
    } catch {
      // never let Sentry breakage hide the original error from the user
    }
  }

  handleReset = () => {
    this.setState((s) => ({ error: null, resetKey: s.resetKey + 1 }))
  }

  render() {
    if (this.state.error) {
      const message =
        this.state.error.message ||
        this.state.error.toString() ||
        "Unknown error"
      return (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-6 text-sm">
          <div className="flex items-start gap-3 mb-4">
            <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-amber-300">
                {this.props.tabName} tab hit an error
              </p>
              <p className="text-muted-foreground mt-1 text-xs break-words">
                {message.slice(0, 400)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <button
              onClick={this.handleReset}
              className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500/30 hover:bg-amber-500/40 px-3 py-1.5 font-medium text-amber-200 transition-colors"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Try again
            </button>
            <span className="text-muted-foreground">
              Other tabs still work — switch and come back.
            </span>
          </div>
        </div>
      )
    }
    return (
      <div key={this.state.resetKey}>{this.props.children}</div>
    )
  }
}

export default TabErrorBoundary
