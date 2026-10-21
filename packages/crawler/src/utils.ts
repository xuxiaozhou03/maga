import { prisma, Prisma } from "@maga/db";
import dayjs from "dayjs";
import fs from "fs";
import path from "path";

export interface Task<T = any> {
  name: string;
  fetch: () => Promise<T>;
  save: (data: T) => Promise<void>;
}

// 是否执行
const needRun = async (taskName: string) => {
  return true;
  const task = await prisma.task.findFirst({
    where: { name: taskName },
  });

  if (!task) {
    return true;
  }

  if (
    task.status === "success" &&
    dayjs(task.updatedAt).valueOf() > dayjs().startOf("D").valueOf()
  ) {
    return false;
  }

  return true;
};

const updateTask = async (partialTask: Partial<Prisma.TaskCreateInput>) => {
  const task = {
    ...partialTask,
  } as Prisma.TaskCreateInput;
  await prisma.task.upsert({
    where: { name: task.name },
    create: task,
    update: task,
  });
};

export const runTask = async <T = any>(task: Task<T>) => {
  const ss = await needRun(task.name);
  if (!ss) {
    console.log("skip", task.name);
    return;
  }

  console.log("run ", task.name);

  let data;

  try {
    data = await task.fetch();
  } catch (e) {
    await updateTask({
      name: task.name,
      status: "failed",
      message: "请求接口失败",
    });
    return;
  }

  if (!data || (Array.isArray(data) && data.length === 0)) {
    await updateTask({
      name: task.name,
      status: "failed",
      message: "返回数据为空",
    });
    return;
  }

  await task.save(data);
  await updateTask({
    name: task.name,
    status: "success",
    message: null,
  });

  console.log("done", task.name);
};

export const saveToFile = (filename: string, content: string) => {
  fs.writeFileSync(path.join(`./data/${filename}`), content);
};
