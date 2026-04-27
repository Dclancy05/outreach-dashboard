/**
 * Catch-all dispatcher for /api/memory-vault/* — forwards to the parent route's proxy.
 * Lets us hit /api/memory-vault/tree, /api/memory-vault/file, etc. with one handler.
 */
export { GET, PUT, POST, DELETE } from "../route"
