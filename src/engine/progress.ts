import { EventEmitter } from "node:events";

export type ProgressPayload = {
  type: string;
  [key: string]: unknown;
};

export const progressBus = new EventEmitter();
progressBus.setMaxListeners(0);

const latestByRun = new Map<string, ProgressPayload>();

export function emitProgress(runId: string, payload: ProgressPayload) {
  latestByRun.set(runId, payload);
  progressBus.emit(`run:${runId}`, payload);
}

export function getLatestProgress(runId: string): ProgressPayload | null {
  return latestByRun.get(runId) ?? null;
}
