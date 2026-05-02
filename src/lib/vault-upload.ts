/**
 * vault-upload — helper for drag-drop upload of markdown / text files into
 * the Memory Vault. Reads the file as UTF-8 text and PUTs to
 * `/api/memory-vault/file` with `{path, content}`.
 *
 * Used by `tree-view.tsx` (drag-drop) but kept standalone so other surfaces
 * (e.g. the agent-skills tab) can reuse the same code path.
 *
 * Hard limits enforced here (mirroring the API):
 *   - 1 MB max file size
 *   - only `.md` / `.markdown` / `text/*` MIME types
 */

export interface UploadResult {
  ok: true
  path: string
}

export interface UploadError {
  ok: false
  /** machine-readable reason — used by callers to pick a toast message */
  reason: "too_large" | "wrong_type" | "empty_name" | "http_error" | "read_error"
  /** human-readable detail — surfaced verbatim in toasts */
  message: string
}

export const MAX_VAULT_UPLOAD_BYTES = 1024 * 1024 // 1 MB

/** Returns true when the File looks like markdown / plain text. */
export function isAcceptedVaultFile(file: File): boolean {
  const name = (file.name || "").toLowerCase()
  if (name.endsWith(".md") || name.endsWith(".markdown") || name.endsWith(".txt")) return true
  // Some browsers report markdown as text/markdown; others as application/octet-stream.
  // Accept anything that says text/* — we read as UTF-8.
  if (file.type && file.type.startsWith("text/")) return true
  return false
}

/** Read a File as UTF-8 text. Wraps FileReader in a Promise. */
function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error || new Error("Failed to read file"))
    reader.onload = () => {
      const result = reader.result
      if (typeof result === "string") resolve(result)
      else reject(new Error("Unexpected non-text result from FileReader"))
    }
    reader.readAsText(file, "utf-8")
  })
}

/** Build a normalized vault path from a parent folder + filename. */
function joinVaultPath(parentPath: string, filename: string): string {
  const parent = parentPath.replace(/\/+$/, "") // trim trailing slash(es)
  const name = filename.replace(/^\/+/, "")     // trim leading slash(es) on filename
  if (!parent) return `/${name}`
  return `${parent}/${name}`
}

/**
 * Upload a file to the vault under `parentPath`.
 *
 * Returns `{ok: true, path}` on success, `{ok: false, reason, message}` on
 * rejection or upstream error. NEVER throws — callers can wrap in
 * `toast.promise()` by re-rejecting on `ok === false`.
 */
export async function uploadFileToVault(
  file: File,
  parentPath: string
): Promise<UploadResult | UploadError> {
  if (!file.name || file.name.trim().length === 0) {
    return { ok: false, reason: "empty_name", message: "File has no name" }
  }

  if (!isAcceptedVaultFile(file)) {
    return {
      ok: false,
      reason: "wrong_type",
      message: `${file.name}: only markdown / text supported`,
    }
  }

  if (file.size > MAX_VAULT_UPLOAD_BYTES) {
    return {
      ok: false,
      reason: "too_large",
      message: `${file.name}: too big (max 1 MB)`,
    }
  }

  let content: string
  try {
    content = await readFileAsText(file)
  } catch (err) {
    return {
      ok: false,
      reason: "read_error",
      message: `${file.name}: ${err instanceof Error ? err.message : "could not read file"}`,
    }
  }

  const path = joinVaultPath(parentPath || "/", file.name)

  const res = await fetch("/api/memory-vault/file", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, content }),
  })

  if (!res.ok) {
    let detail = `HTTP ${res.status}`
    try {
      const data = (await res.json()) as { error?: string }
      if (data.error) detail = data.error
    } catch {
      // body wasn't JSON — keep the HTTP status fallback
    }
    return { ok: false, reason: "http_error", message: `${file.name}: ${detail}` }
  }

  return { ok: true, path }
}
