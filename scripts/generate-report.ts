import { reportModeSchema, reportTypeSchema } from "../src/domain/report.js";
import { createAppServices } from "../src/server/context.js";

const args = process.argv.slice(2);
const date = readOption("--date");
const version = readVersionOption("--version");
const typeValue = readOption("--type");
const modeValue = readOption("--mode");

const type = typeValue === null ? undefined : reportTypeSchema.safeParse(typeValue);
if (type !== undefined && !type.success) {
  throw new Error(`Unknown report type: ${typeValue}`);
}
const mode = modeValue === null ? undefined : reportModeSchema.safeParse(modeValue);
if (mode !== undefined && !mode.success) {
  throw new Error(`Unknown report mode: ${modeValue}`);
}

const services = await createAppServices();
const result = await services.reports.generate({
  ...(date === null ? {} : { date }),
  ...(version === null ? {} : { version }),
  ...(type === undefined ? {} : { type: type.data }),
  ...(mode === undefined ? {} : { mode: mode.data }),
  trigger: "cli",
});
console.log(
  JSON.stringify(
    {
      taskId: result.task.taskId,
      taskStatus: result.task.status,
      reportId: result.report.reportId,
      analysisDate: result.report.analysisDate,
      snapshotVersion: result.report.snapshotVersion,
      mode: result.report.mode,
      status: result.report.status,
      fallback: result.fallback,
      citations: result.report.citations.length,
      error: result.report.error,
    },
    null,
    2,
  ),
);
if (result.report.status === "failed") {
  process.exitCode = 1;
}

function readOption(name: string): string | null {
  const index = args.indexOf(name);
  if (index < 0) {
    return null;
  }
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${name} requires a value`);
  }
  return value;
}

function readVersionOption(name: string): number | null {
  const value = readOption(name);
  if (value === null) {
    return null;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}
