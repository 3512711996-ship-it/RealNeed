import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-auth";
import { collectCostMetrics } from "@/lib/cost-metrics";

export const runtime = "nodejs";

export async function GET() {
  if (!(await getAdminSession())) {
    return NextResponse.json({ message: "未登录。" }, { status: 401 });
  }

  return NextResponse.json(await collectCostMetrics());
}
