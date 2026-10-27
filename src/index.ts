import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { serveStatic } from "@hono/node-server/serve-static";
import { fetchEtfs } from "./services/fetchEtfs.js";
import { memCache } from "hono-mem-cache";
import { fetchKline } from "./services/fetchKlines.js";

const app = new Hono();

app.get("/api/etfs", memCache({ max: 100, ttl: 60000 }), async (c) => {
  const etfs = await fetchEtfs();
  return c.json(etfs);
});
app.get("/api/:code/kline", async (c) => {
  const { code } = c.req.param();
  const klines = await fetchKline(code);
  return c.json(klines);
});
app.get("*", serveStatic({ path: "./static/index.html" }));

serve(
  {
    fetch: app.fetch,
    port: 3100,
  },
  (info) => {
    console.log(`Server is running on http://localhost:${info.port}`);
  },
);
