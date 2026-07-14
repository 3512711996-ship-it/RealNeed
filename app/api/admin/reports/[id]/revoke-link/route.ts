import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST() {
  return NextResponse.json({ message: "管理员代为撤销报告链接已下线。报告所有者可以在恢复链接页面自行管理。" }, { status: 410 });
}
