import { NextRequest, NextResponse } from "next/server"
import { handleAction } from "@/lib/supabase"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * POST /api/leads/import
 *
 * Imports leads from a completed AutoBot scraping run.
 * Takes a run_id, reads data_collected, maps fields, deduplicates, and inserts.
 *
 * Body:
 *   run_id: string          — ID of the autobot_runs record
 *   field_mapping?: object   — Custom field mapping overrides
 *   sequence_id?: string     — Auto-assign imported leads to a sequence
 *   business_id?: string     — Business to import into
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json()

    if (!body.run_id) {
      return NextResponse.json(
        { success: false, error: "Missing run_id" },
        { status: 400 }
      )
    }

    const result = await handleAction("import_leads_from_run", body)
    return NextResponse.json(result)
  } catch (error) {
    console.error("Leads import error:", error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}
