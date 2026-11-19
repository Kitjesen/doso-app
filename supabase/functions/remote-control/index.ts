import { authenticate } from "../_shared/auth.ts";
import { handleRemoteControl } from "./handler.ts";

if (import.meta.main) {
  Deno.serve((request) => handleRemoteControl(request, { authenticate }));
}
