import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST() {
  return NextResponse.json({ message: "管理员代为生成报告链接已下线。报告所有者可以在恢复链接页面自行生成。" }, { status: 410 });
}
