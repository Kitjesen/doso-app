import { createTelemetryExportHandler } from "../../supabase/functions/telemetry-export/handler.ts";

const read = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) throw new Error("missing_live_configuration");
  return value;
};
const executable = read("DOSO_TELEMETRY_PSQL");
const host = read("DOSO_TELEMETRY_PGHOST");
const port = read("DOSO_TELEMETRY_PGPORT");
const database = read("DOSO_TELEMETRY_PGDATABASE");
const secret = read("DOSO_TELEMETRY_LIVE_KEY");
if (host !== "127.0.0.1" || !/^\d+$/.test(port) || database !== "doso_multi_device_verification") {
  throw new Error("live_test_requires_isolated_database");
}
const uuid = (value: unknown) => {
  if (typeof value !== "string" || !/^[a-f0-9-]{36}$/.test(value)) throw new Error("invalid_rpc_uuid");
  return `'${value}'::uuid`;
};

// Only PostgREST transport is replaced; the production handler and SQL remain active.
const handler = createTelemetryExportHandler({
  readEnvironment: (name) => name === "SUPABASE_SECRET_KEYS"
    ? JSON.stringify({ "telemetry-export": secret })
    : undefined,
  createClient: () => ({
    async rpc(name: string, args: Record<string, unknown>) {
      try {
        let call: string;
        if (name === "claim_telemetry_export") call = "public.claim_telemetry_export()";
        else if (name === "check_telemetry_export") {
          call = `public.check_telemetry_export(${uuid(args.p_id)},${uuid(args.p_lease_token)},${args.p_tb_device_id === null ? "null" : uuid(args.p_tb_device_id)})`;
        } else if (name === "finish_telemetry_export" && ["delivered", "retry", "conflict"].includes(String(args.p_outcome))) {
          call = `public.finish_telemetry_export(${uuid(args.p_id)},${uuid(args.p_lease_token)},'${args.p_outcome}')`;
        } else throw new Error("unsupported_rpc");
        const result = await new Deno.Command(executable, {
          args: ["-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-w", "-h", host, "-p", port, "-U", "postgres", "-d", database,
            "-c", `set role service_role; select ${call};`],
          stdout: "piped", stderr: "piped",
        }).output();
        if (!result.success || result.stdout.length > 128 * 1024) throw new Error("rpc_failed");
        return { data: JSON.parse(new TextDecoder().decode(result.stdout)), error: null };
      } catch {
        return { data: null, error: "local_rpc_failed" };
      }
    },
  }),
});

Deno.serve({ hostname: "127.0.0.1", port: 0, onListen: ({ port }) => console.log(`READY ${port}`) }, handler);
