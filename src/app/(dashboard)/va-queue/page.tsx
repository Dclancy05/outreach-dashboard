"use client"

import { redirect } from "next/navigation"

// This page has been merged into the unified queue system.
// Admin view: /queue (dashboard)
// VA view: /va/queue
export default function DeprecatedVAQueuePage() {
  redirect("/queue")
}
