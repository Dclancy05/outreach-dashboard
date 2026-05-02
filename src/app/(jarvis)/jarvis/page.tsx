// /jarvis → /jarvis/memory
//
// Server-only redirect. Memory is the canonical landing page for the Jarvis
// sub-app (per W1A spec). If a user lands here from a deep link or the back
// button, we send them to Memory.

import { redirect } from "next/navigation"

export default function JarvisRootPage(): never {
  redirect("/jarvis/memory")
}
