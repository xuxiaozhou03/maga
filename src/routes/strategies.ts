import { Hono } from "hono";
import { registry } from "../strategies/index.js";

export const strategiesRoute = new Hono();

strategiesRoute.get("/", (context) =>
  context.json(
    Object.values(registry).map(
      ({ key, name, description, paramsSchema }) => ({
        key,
        name,
        description,
        paramsSchema,
      }),
    ),
  ),
);
