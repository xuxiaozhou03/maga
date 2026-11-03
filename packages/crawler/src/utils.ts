import { prisma, Prisma } from "@maga/db";

export interface Task<T = any> {
  name: string;
  fetch: () => Promise<T>;
  save: (data: T) => Promise<void>;
}

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
