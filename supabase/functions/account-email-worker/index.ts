import { serviceClient } from "../_shared/auth.ts";
import { json } from "../_shared/http.ts";
import {
  authorizeNamedSecretKey,
  readWorkerLimit,
  runWorker,
  WorkerRequestError,
} from "./workerCore.ts";

const readEnvironment = (name: string) => Deno.env.get(name);

export function createAccountEmailWorkerHandler(dependencies: {
  readEnvironment: (name: string) => string | undefined;
  run: (limit: number) => ReturnType<typeof runWorker>;
}) {
  return async (request: Request): Promise<Response> => {
    try {
      if (request.method !== "POST") {
        return json({ error: { code: "method_not_allowed" } }, 405);
      }
      if (!authorizeNamedSecretKey(request, dependencies.readEnvironment)) {
        return json({ error: { code: "unauthorized_worker" } }, 401);
      }
      const summary = await dependencies.run(await readWorkerLimit(request));
      console.log(JSON.stringify({
        event: "account_email_worker_complete",
        workerId: summary.workerId,
        claimed: summary.claimed,
        accepted: summary.accepted,
        retryScheduled: summary.retryScheduled,
        deadLettered: summary.deadLettered,
        deliveryUnknown: summary.deliveryUnknown,
        unknownPersistencePending: summary.unknownPersistencePending,
        fencedOut: summary.fencedOut,
      }));
      return json(summary);
    } catch (error) {
      if (error instanceof WorkerRequestError) {
        return json({
          error: {
            code: "invalid_worker_request",
            message: error.message,
          },
        }, 400);
      }
      console.error({
        event: "account_email_worker_failed",
        error: error instanceof Error ? error.name : "unknown_error",
      });
      return json({
        error: {
          code: "worker_failed",
          message:
            "The account email worker could not complete this invocation.",
        },
      }, 500);
    }
  };
}

export const handleAccountEmailWorker = createAccountEmailWorkerHandler({
  readEnvironment,
  run: (limit) =>
    runWorker(limit, {
      db: serviceClient(),
      readEnvironment,
    }),
});

if (import.meta.main) Deno.serve(handleAccountEmailWorker);
