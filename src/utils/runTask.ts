import { prisma } from "../prisma/index.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TaskData = any;

export interface Task<T = TaskData> {
  name: string;
  fetch: () => Promise<T>;
  save: (data: T) => Promise<void>;
}

export const runTask = async <T = TaskData>(task: Task<T>) => {
  console.log("run ", task.name);

  const existingTask = await prisma.task.findUnique({
    where: { name: task.name },
  });

  if (existingTask && existingTask.status === "success") {
    console.log("skip ", task.name);
    return;
  }

  let data;

  try {
    data = await task.fetch();
  } catch (e) {
    console.log("error", task.name, e);
    await prisma.task.upsert({
      where: { name: task.name },
      create: { name: task.name, status: "failed" },
      update: { status: "failed" },
    });
    return;
  }

  await task.save(data);
  await prisma.task.upsert({
    where: { name: task.name },
    create: { name: task.name, status: "success" },
    update: { status: "success" },
  });

  console.log("done", task.name);
};

export const runTasks = async (tasks: Task[]) => {
  console.log("run tasks", tasks.map((task) => task.name).join(", "));
  for (const task of tasks) {
    await runTask(task);
    await new Promise((resolve) => setTimeout(resolve, 1000)); // Sleep for 1 second between tasks
  }
  console.log("done tasks", tasks.map((task) => task.name).join(", "));
};
