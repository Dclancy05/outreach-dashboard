import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  // Intentional uncaught error so Sentry captures it on live.
  throw new Error("Sentry wiring smoke test — thrown from /api/_sentry-test");
  // eslint-disable-next-line no-unreachable
  return NextResponse.json({ ok: true });
}
