import { runCrawler } from "@/services/crawler";
import { NextResponse } from "next/server";

export const GET = async () => {
  await runCrawler();
  return NextResponse.json({ success: true });
};
