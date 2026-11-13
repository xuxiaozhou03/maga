import { createRequire } from "node:module";
import { prisma } from "../db.js";

const require = createRequire(import.meta.url);
const { isTradingDay } = require("@yiliang114/trading-day") as {
  isTradingDay: (date: string | number | Date) => boolean;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TaskData = any;

export interface Task<T = TaskData> {
  name: string;
  fetch: () => Promise<T>;
  save: (data: T) => Promise<void>;
}

function isAfterMarketClose(date: Date): boolean {
  const close = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    15,
    0,
    0,
    0,
  );
  return date >= close;
}

function hasNewTradingDaySince(from: Date, to: Date): boolean {
  if (isTradingDay(from) && !isAfterMarketClose(from)) {
    const sameDayClose = new Date(
      from.getFullYear(),
      from.getMonth(),
      from.getDate(),
      15,
      0,
      0,
      0,
    );
    if (to >= sameDayClose) return true;
  }

  const cursor = new Date(from);
  cursor.setDate(cursor.getDate() + 1);
  cursor.setHours(0, 0, 0, 0);
  const end = new Date(to);
  end.setHours(23, 59, 59, 999);

  while (cursor <= end) {
    if (isTradingDay(cursor)) {
      const close = new Date(
        cursor.getFullYear(),
        cursor.getMonth(),
        cursor.getDate(),
        15,
        0,
        0,
        0,
      );
      if (to >= close) return true;
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return false;
}

export async function shouldRun(name: string, force = false): Promise<boolean> {
  if (force) return true;
  const task = await prisma.task.findUnique({ where: { name } });
  if (!task || task.status !== "success" || !task.finishedAt) return true;
  return hasNewTradingDaySince(task.finishedAt, new Date());
}

async function markFailed(name: string, error: unknown) {
  await prisma.task.upsert({
    where: { name },
    create: {
      name,
      status: "failed",
      finishedAt: new Date(),
      error: String(error instanceof Error ? error.message : error),
    },
    update: {
      status: "failed",
      finishedAt: new Date(),
      error: String(error instanceof Error ? error.message : error),
    },
  });
}

export const runTask = async <T = TaskData>(
  task: Task<T>,
  force = false,
): Promise<boolean> => {
  if (!(await shouldRun(task.name, force))) {
    console.log(`[skip] ${task.name} 未过期（无新交易日收盘）`);
    return false;
  }

  try {
    console.log(`[run] ${task.name}`);
    const data = await task.fetch();
    await task.save(data);
    await prisma.task.upsert({
      where: { name: task.name },
      create: {
        name: task.name,
        status: "success",
        finishedAt: new Date(),
        error: null,
      },
      update: {
        status: "success",
        finishedAt: new Date(),
        error: null,
      },
    });
    console.log(`[done] ${task.name}`);
    return true;
  } catch (error) {
    console.error(`[failed] ${task.name}`, error);
    await markFailed(task.name, error);
    throw error;
  }
};

export const runTasks = async (tasks: Task[], force = false) => {
  console.log("run tasks", tasks.map((task) => task.name).join(", "));
  for (const task of tasks) {
    await runTask(task, force);
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  console.log("done tasks", tasks.map((task) => task.name).join(", "));
};
