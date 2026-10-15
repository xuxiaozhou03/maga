/**
 * Vitest 全局初始化。
 *
 * Next.js 会自动加载 `.env`，但 Vitest 不会，因此这里显式加载，
 * 保证集成测试可以按 `DATABASE_URL` 读取真实 SQLite 数据库。
 */

import "dotenv/config";

if (!process.env.DATABASE_URL) {
  // 与 .env.example 保持一致：相对路径由 Prisma 按 schema.prisma 所在目录解析。
  process.env.DATABASE_URL = "file:./dev.db";
}
