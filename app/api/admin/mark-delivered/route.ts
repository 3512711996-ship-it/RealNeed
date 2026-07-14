import { NextResponse } from "next/server";
export async function POST() {
  return NextResponse.json({ message: "人工发货流程已下线。报告生成后会自动创建私有链接。" }, { status: 410 });
}
