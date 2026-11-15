import { createRequire } from "node:module";

interface TradingDayPackage {
  getLastTradingDay(input?: string | Date): string;
  getTradingDays(start: string | Date, end: string | Date): string[];
}

const require = createRequire(import.meta.url);
const tradingDay = require("@yiliang114/trading-day") as TradingDayPackage;

export function getLastTradingDay(input?: string | Date): string {
  return tradingDay.getLastTradingDay(input);
}

export function listTradingDays(start: string | Date, end: string | Date): string[] {
  return tradingDay.getTradingDays(start, end);
}
