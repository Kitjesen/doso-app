import { authenticate } from "../_shared/auth.ts";
import { handleRemoteState } from "./handler.ts";

if (import.meta.main) {
  Deno.serve((request) => handleRemoteState(request, { authenticate }));
}
