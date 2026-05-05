import { redirect } from "next/navigation"

/**
 * /jarvis/runs — alias that drops the user into the Runs tab of the Agents
 * page. The sidebar's Runs item already deep-links via `?tab=runs`; this
 * route exists so direct URL hits don't 404.
 */
export default function JarvisRunsAlias(): never {
  redirect("/jarvis/agents?tab=runs")
}
