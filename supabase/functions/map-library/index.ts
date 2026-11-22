import { authenticate } from "../_shared/auth.ts";
import { handleMapLibrary } from "./handler.ts";
import { configuredMapObjectStore } from "./oss.ts";

Deno.serve((request) =>
  handleMapLibrary(request, {
    authenticate,
    objectStore: configuredMapObjectStore,
  })
);
