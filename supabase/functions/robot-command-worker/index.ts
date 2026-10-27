import { createClient } from "@supabase/supabase-js";
import { json } from "../_shared/http.ts";
import { createRobotCommandGatewayTransport } from "./gatewayTransport.ts";
import {
  authenticateRobotCommandWorker,
  importEd25519Pkcs8Signer,
  readRobotCommandWorkerLimit,
  robotCommandDeliveryEnabled,
  type RobotCommandRpcClient,
  type RobotCommandSigner,
  robotCommandSigningKey,
  type RobotCommandTransport,
  RobotCommandWorkerConfigurationError,
  type RobotCommandWorkerSummary,
  robotCommandWorkerUrl,
  runRobotCommandWorker,
} from "./workerCore.ts";

type EnvironmentReader = (name: string) => string | undefined;

export type RobotCommandWorkerHandlerDependencies = {
  readEnvironment: EnvironmentReader;
  createTransport(read: EnvironmentReader): RobotCommandTransport | null;
  importSigner(pkcs8Pem: string): Promise<RobotCommandSigner>;
  createAdminClient(url: string, secretKey: string): RobotCommandRpcClient;
  run(
    limit: number,
    dependencies: Readonly<{
      db: RobotCommandRpcClient;
      signer: RobotCommandSigner;
      transport: RobotCommandTransport;
    }>,
  ): Promise<RobotCommandWorkerSummary>;
};

function safeSummary(
  summary: RobotCommandWorkerSummary,
): RobotCommandWorkerSummary {
  return {
    reconciledBefore: summary.reconciledBefore,
    reconciledAfter: summary.reconciledAfter,
    claimed: summary.claimed,
    authorityChanged: summary.authorityChanged,
    invalidClaims: summary.invalidClaims,
    fencedOut: summary.fencedOut,
    published: summary.published,
    transportFailures: summary.transportFailures,
    deliveryUnknown: summary.deliveryUnknown,
    persistenceUnknown: summary.persistenceUnknown,
  };
}

export function createRobotCommandWorkerHandler(
  dependencies: RobotCommandWorkerHandlerDependencies,
): (request: Request) => Promise<Response> {
  return async (request: Request): Promise<Response> => {
    if (request.method !== "POST") {
      return json({ error: { code: "method_not_allowed" } }, 405);
    }

    try {
      const namedSecret = authenticateRobotCommandWorker(
        request,
        dependencies.readEnvironment,
      );
      if (namedSecret === null) {
        return json({ error: { code: "unauthorized_worker" } }, 401);
      }

      if (!robotCommandDeliveryEnabled(dependencies.readEnvironment)) {
        return json({ error: { code: "delivery_disabled" } }, 503);
      }

      const transport = dependencies.createTransport(
        dependencies.readEnvironment,
      );
      if (transport === null) {
        return json({ error: { code: "transport_unconfigured" } }, 503);
      }

      const signer = await dependencies.importSigner(
        robotCommandSigningKey(dependencies.readEnvironment),
      );
      const limit = await readRobotCommandWorkerLimit(request);
      const db = dependencies.createAdminClient(
        robotCommandWorkerUrl(dependencies.readEnvironment),
        namedSecret,
      );
      const summary = safeSummary(
        await dependencies.run(limit, {
          db,
          signer,
          transport,
        }),
      );
      console.log(JSON.stringify({
        event: "robot_command_worker_complete",
        ...summary,
      }));
      return json(summary);
    } catch (error) {
      if (error instanceof RobotCommandWorkerConfigurationError) {
        console.error(JSON.stringify({
          event: "robot_command_worker_configuration_failed",
          failed: 1,
        }));
        return json({ error: { code: error.code } }, 503);
      }
      console.error(JSON.stringify({
        event: "robot_command_worker_failed",
        failed: 1,
      }));
      return json({ error: { code: "worker_failed" } }, 500);
    }
  };
}

function readEnvironment(name: string): string | undefined {
  return Deno.env.get(name);
}

export const handleRobotCommandWorker = createRobotCommandWorkerHandler({
  readEnvironment,
  createTransport: (read) => createRobotCommandGatewayTransport(read),
  importSigner: importEd25519Pkcs8Signer,
  createAdminClient: (url, secretKey) =>
    createClient(url, secretKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    }),
  run: (limit, dependencies) => runRobotCommandWorker(limit, dependencies),
});

if (import.meta.main) Deno.serve(handleRobotCommandWorker);
