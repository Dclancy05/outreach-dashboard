/**
 * /jarvis/mcps/[id] — direct-link route that opens the detail drawer.
 *
 * The orchestrator already syncs the drawer with `?id=…`. To keep deep-link
 * URLs clean (e.g. `/jarvis/mcps/abc123`), we redirect the path-style URL into
 * the query-string form so all drawer logic stays in one place.
 *
 * This is a server component — the redirect runs before any client JS ships.
 */

import { redirect } from "next/navigation"

interface JarvisMcpDetailRouteProps {
  params: { id: string }
}

export default function JarvisMcpDetailRoute({
  params,
}: JarvisMcpDetailRouteProps): never {
  const id = params?.id ? String(params.id) : ""
  if (!id) redirect("/jarvis/mcps")
  redirect(`/jarvis/mcps?id=${encodeURIComponent(id)}`)
}
