import { authenticate } from "../_shared/auth.ts";
import { handleRemoteHistory } from "./handler.ts";

if (import.meta.main) {
  Deno.serve((request) =>
    handleRemoteHistory(request, {
      authenticate,
      readEnvironment: (name) => Deno.env.get(name),
      fetch,
    })
  );
}
