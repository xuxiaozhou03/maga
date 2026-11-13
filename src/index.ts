import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { strategiesRoute } from "./routes/strategies.js";
import { backtestsRoute } from "./routes/backtests.js";
import { syncRoute } from "./routes/sync.js";
import { featuresRoute } from "./routes/features.js";

const app = new Hono();

app.use(
  "/api/*",
  cors({
    origin: (origin) => origin ?? "*",
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type"],
  }),
);

app.route("/api/strategies", strategiesRoute);
app.route("/api/backtests", backtestsRoute);
app.route("/api/sync", syncRoute);
app.route("/api/features", featuresRoute);

app.get("/", (context) => context.redirect("/index.html"));
app.use("/*", serveStatic({ root: "./public" }));

app.onError((error, context) => {
  console.error(error);
  return context.json({ error: error.message }, 500);
});

const isEntryPoint =
  process.argv[1] != null &&
  new URL(import.meta.url).pathname ===
    new URL(`file://${process.argv[1]}`).pathname;

if (isEntryPoint) {
  const port = Number(process.env.PORT ?? 3110);
  serve(
    {
      fetch: app.fetch,
      port,
    },
    (info) => {
      console.log(`Server is running on http://localhost:${info.port}`);
    },
  );
}

export default app;
