import { serviceClient } from "../_shared/auth.ts";
import { createRemoteStateSyncHandler } from "./handler.ts";

export const handleRemoteStateSync = createRemoteStateSyncHandler({
  readEnvironment: (name) => Deno.env.get(name),
  createClient: serviceClient,
});

if (import.meta.main) Deno.serve(handleRemoteStateSync);
