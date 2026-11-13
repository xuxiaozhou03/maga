import { runTask } from "../utils/runTask.js";
import { getKlineTask } from "./etf/klines.js";
import { etfsTask } from "./etfs.js";
import { getIndexDistributionTask } from "./index/distribution.js";
import { getIndexValuationTasks } from "./index/valuation.js";
import { getCrossSectionTask, getFeatureTask } from "./feature-task.js";
import { prisma } from "../db.js";

export async function runDailySync(force = false) {
  await runTask(etfsTask, force);

  const etfs = await prisma.etf.findMany({
    select: { code: true, trackIndex: true },
    orderBy: { scale: "desc" },
  });

  for (const { code, trackIndex } of etfs) {
    await runTask(getKlineTask(code), force);
    if (trackIndex) {
      for (const task of getIndexValuationTasks(trackIndex)) {
        await runTask(task, force);
      }
      await runTask(getIndexDistributionTask(trackIndex), force);
    }
    await runTask(getFeatureTask(code), force);
  }
  await runTask(getCrossSectionTask(), force);
}

export const run = runDailySync;
