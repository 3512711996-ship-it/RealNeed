import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST() {
  return NextResponse.json({ message: "管理员不再代替用户重试报告。请由报告所有者更新自己的 API 连接后在结果页重新生成。" }, { status: 410 });
}
