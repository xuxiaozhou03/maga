import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { createAppServices } from "./context.js";
import { LockManager } from "../storage/lock-manager.js";
import { recoverSystem } from "../snapshots/recovery.js";
import { logger } from "../logging.js";

const port = Number.parseInt(process.env.PORT ?? "3000", 10);
const hostname = process.env.HOST ?? "127.0.0.1";

if (!Number.isInteger(port) || port <= 0 || port > 65535) {
  throw new Error(`Invalid PORT: ${process.env.PORT}`);
}
if (!["127.0.0.1", "::1", "localhost"].includes(hostname) && !process.env.ADMIN_TOKEN) {
  throw new Error("ADMIN_TOKEN is required when binding to a non-loopback host");
}

const services = await createAppServices();
const recovery = await recoverSystem(
  services.paths,
  services.store,
  new LockManager(services.paths),
);
logger.info(
  {
    event: "startup_recovery",
    scannedSnapshots: recovery.scannedSnapshots,
    validSnapshots: recovery.validSnapshots,
    invalidSnapshots: recovery.invalidSnapshots.length,
    currentRepaired: recovery.currentRepaired,
    cleanedTempEntries: recovery.cleanedTempEntries,
    cleanedStaleLocks: recovery.cleanedStaleLocks.length,
    warnings: recovery.warnings.length,
  },
  "Startup recovery completed",
);
if (recovery.invalidSnapshots.length > 0) {
  logger.warn(
    { event: "startup_recovery_invalid_snapshots", snapshots: recovery.invalidSnapshots },
    "Invalid snapshots were excluded from current",
  );
}

const app = createApp(services);
const server = serve({ fetch: app.fetch, port, hostname }, (info) => {
  console.log(`maga v0.5.1 listening on http://${hostname}:${info.port}`);
});

const shutdown = () => {
  server.close(() => process.exit(0));
};

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
