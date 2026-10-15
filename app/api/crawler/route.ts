import { runCrawler, runEtfOnly, runKlineOnly } from "@/services/crawler";
import { NextResponse } from "next/server";

export const GET = async (request: Request) => {
  const scope = new URL(request.url).searchParams.get("scope") ?? "all";

  if (scope === "etf") {
    const etfs = await runEtfOnly();
    return NextResponse.json({ success: true, scope, etfs: etfs.length });
  }

  if (scope === "kline") {
    const etfs = await runKlineOnly();
    return NextResponse.json({ success: true, scope, etfs });
  }

  await runCrawler();
  return NextResponse.json({ success: true, scope: "all" });
};
