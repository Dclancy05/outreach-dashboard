// /jarvis — home dashboard.
//
// Was a server-only redirect to /jarvis/memory. Now renders a real welcome
// page with the 90-day activity heatmap + a tile grid of every Jarvis
// surface for fast navigation. The "Open Memory" CTA at the top makes
// landing here cost <1 click for the canonical entry-point user.

import { JarvisHome } from "@/components/jarvis/home/jarvis-home"

export default function JarvisRootPage() {
  return <JarvisHome />
}
