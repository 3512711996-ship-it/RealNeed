import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST() {
  return NextResponse.json({ message: "付费确认流程已下线。Deep Dive 现在免费生成，并且只使用用户自己的 API。历史订单仅可查看。" }, { status: 410 });
}
