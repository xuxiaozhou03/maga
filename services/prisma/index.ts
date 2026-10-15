import { PrismaClient } from "@prisma/client";

let _prisma: PrismaClient | undefined;

/** 共享 PrismaClient（首次调用才实例化，避免模块加载时就要求 DATABASE_URL） */
function getPrisma(): PrismaClient {
  if (!_prisma) _prisma = new PrismaClient();
  return _prisma;
}

export const prisma = getPrisma();
