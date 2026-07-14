import { NextResponse } from "next/server";
export async function PATCH() {
  return NextResponse.json({ message: "历史订单已经只读，不能再修改付款或客户备注。" }, { status: 410 });
}
