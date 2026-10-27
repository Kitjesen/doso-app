import { serviceClient } from "../_shared/auth.ts";
import { createRobotIngressHandler, SupabaseRobotProjectionStore } from "../_shared/robotIngress.ts";

export const handleRobotIngress = createRobotIngressHandler({
  readEnvironment: (name) => Deno.env.get(name),
  createStore: () => new SupabaseRobotProjectionStore(serviceClient()),
});

if (import.meta.main) Deno.serve(handleRobotIngress);
