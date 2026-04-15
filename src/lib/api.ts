const API_BASE = "/api/dashboard"

export async function dashboardApi(action: string, data?: Record<string, unknown>) {
  const res = await fetch(API_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...data }),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(err || `API error: ${res.status}`)
  }
  const json = await res.json()
  if (json.success === false) {
    throw new Error(json.error || "Unknown API error")
  }
  return json.data
}

export async function dashboardApiFull(action: string, data?: Record<string, unknown>) {
  const res = await fetch(API_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...data }),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(err || `API error: ${res.status}`)
  }
  const json = await res.json()
  if (json.success === false) {
    throw new Error(json.error || "Unknown API error")
  }
  return json
}
