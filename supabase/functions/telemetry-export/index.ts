import { serviceClient } from "../_shared/auth.ts";
import { createTelemetryExportHandler } from "./handler.ts";

export const handleTelemetryExport = createTelemetryExportHandler({
  readEnvironment: (name) => Deno.env.get(name),
  createClient: serviceClient,
});

if (import.meta.main) Deno.serve(handleTelemetryExport);
