import { NextResponse } from "next/server";
import { getCapabilities } from "@/lib/env";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(getCapabilities(), {
    headers: {
      "Cache-Control": "no-store"
    }
  });
}
