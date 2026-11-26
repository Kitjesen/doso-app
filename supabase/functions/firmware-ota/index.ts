import { authenticate } from "../_shared/auth.ts";
import { handleFirmwareOta } from "./handler.ts";

if (import.meta.main) {
  Deno.serve((request) => handleFirmwareOta(request, { authenticate }));
}
