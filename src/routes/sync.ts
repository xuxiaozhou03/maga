import { Hono } from "hono";
import { runDailySync } from "../crawler/index.js";

export const syncRoute = new Hono();

syncRoute.post("/", async (context) => {
  const body = await context.req
    .json<{ force?: boolean }>()
    .catch(() => ({}) as { force?: boolean });
  const force = context.req.query("force") === "1" || body?.force === true;
  try {
    await runDailySync(force);
    return context.json({ ok: true, force });
  } catch (error) {
    return context.json(
      {
        error: String(error instanceof Error ? error.message : error),
      },
      500,
    );
  }
});
