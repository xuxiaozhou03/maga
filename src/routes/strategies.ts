import { Hono } from "hono";
import { registries } from "../strategies/index.js";

export const strategiesRoute = new Hono();

strategiesRoute.get("/", (context) =>
  context.json(
    registries.map(
      ({ key, name, description, paramsSchema }) => ({
        key,
        name,
        description,
        paramsSchema,
      }),
    ),
  ),
);
