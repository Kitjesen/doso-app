import { authenticate } from "../_shared/auth.ts";
import { handleVideoAccess } from "./handler.ts";

if (import.meta.main) {
  Deno.serve((request) => handleVideoAccess(request, { authenticate }));
}
