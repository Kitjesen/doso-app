import { serviceClient } from "../_shared/auth.ts";
import { handleVideoAuthorize } from "./handler.ts";

if (import.meta.main) {
  Deno.serve((request) =>
    handleVideoAuthorize(request, { createClient: serviceClient })
  );
}
