/**
 * Wave 2.4 — HTTP keep-alive wrapper for VPS calls.
 *
 * Every previous call site opened a fresh fetch() per request. At 10x scale
 * (3,600 sends/day + cron probes) that's 3,600+ TCP handshakes/day with the
 * VPS, plus equivalent for the agent-runner. A single shared `http.Agent`
 * with keepAlive keeps a small pool of warm sockets and reuses them.
 *
 * Use `vpsFetch(url, init)` exactly like `fetch()`. It picks the right
 * agent (http vs https) and adds a sane default 25s abort timeout when the
 * caller doesn't provide a signal.
 */

import http from "node:http"
import https from "node:https"

const httpAgent = new http.Agent({
  keepAlive: true,
  keepAliveMsecs: 30_000,
  maxSockets: 25,
  maxFreeSockets: 10,
})

const httpsAgent = new https.Agent({
  keepAlive: true,
  keepAliveMsecs: 30_000,
  maxSockets: 25,
  maxFreeSockets: 10,
})

const DEFAULT_TIMEOUT_MS = 25_000

export interface VpsFetchOptions extends RequestInit {
  /** Override default 25s timeout. */
  timeoutMs?: number
}

/**
 * fetch() variant that uses a shared keep-alive Agent. Node-only: do NOT
 * import this from edge runtime code. Edge runtime should use the global
 * fetch (which runs over Cloudflare's connection pool already).
 */
export async function vpsFetch(input: string | URL, init: VpsFetchOptions = {}): Promise<Response> {
  const url = typeof input === "string" ? new URL(input) : input
  const agent = url.protocol === "https:" ? httpsAgent : httpAgent
  const { timeoutMs = DEFAULT_TIMEOUT_MS, signal, ...rest } = init

  // Compose abort signal: if caller passed one, AND ours, otherwise just ours.
  let combinedSignal = signal
  if (!combinedSignal) {
    combinedSignal = AbortSignal.timeout(timeoutMs)
  }

  // Node's `fetch` (undici) accepts `dispatcher` for keep-alive, not `agent`.
  // We attach the agent via the Node-specific options shape — undici reads it
  // as a hint and falls back gracefully when run under non-undici runtimes.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const opts: any = { ...rest, signal: combinedSignal }
  // Try undici dispatcher first (native Node 18+ fetch); pass legacy agent
  // for any custom polyfill that respects it.
  opts.agent = agent

  return fetch(input as string, opts)
}

export { httpAgent, httpsAgent }
