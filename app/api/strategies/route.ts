/**
 * 已注册策略列表。
 *
 * 策略是仓库里的 TypeScript 文件（`services/strategy/`），不是网页里写出来的，
 * 因此这里只做只读枚举，供页面选择要回测的策略。
 */

import { NextResponse } from "next/server";
import { listRegisteredStrategies } from "@/services/strategy";

export const GET = async () => {
  const strategies = listRegisteredStrategies().map((item) => ({
    id: item.id,
    name: item.name,
    description: item.description ?? null,
    params: item.params,
  }));

  return NextResponse.json({ strategies });
};
