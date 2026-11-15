import pino from "pino";
import type { SourceLogger } from "./sources/types.js";

export const logger: SourceLogger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  base: { service: "maga", version: "0.5.1" },
});
