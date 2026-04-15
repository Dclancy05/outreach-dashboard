import accountHandlers from "./accounts"
import agencyHandlers from "./agency"
import analyticsHandlers from "./analytics"
import contentHandlers from "./content"
import leadHandlers from "./leads"
import messageHandlers from "./messages"
import scrapingHandlers from "./scraping"
import sequenceHandlers from "./sequences"
import settingsHandlers from "./settings"
import vaHandlers from "./va"

const allHandlers: Record<string, (action: string, body: Record<string, unknown>) => Promise<Record<string, unknown>>> = {
  ...accountHandlers,
  ...agencyHandlers,
  ...analyticsHandlers,
  ...contentHandlers,
  ...leadHandlers,
  ...messageHandlers,
  ...sequenceHandlers,
  ...settingsHandlers,
  ...scrapingHandlers,
  ...vaHandlers,
}

export async function handleAction(action: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const handler = allHandlers[action]
  if (!handler) {
    return { success: false, error: `Unknown action: ${action}` }
  }
  return handler(action, body)
}

// Re-export for consumers that import dashboardApi
export const dashboardApi = handleAction
export default handleAction
