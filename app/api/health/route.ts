import { NextResponse } from "next/server";
import { checkHealth } from "@/lib/health";

export async function GET() {
  const result = await checkHealth();

  return NextResponse.json(
    { status: result.healthy ? "ok" : "unhealthy", checks: result.checks },
    { status: result.healthy ? 200 : 503 },
  );
}
