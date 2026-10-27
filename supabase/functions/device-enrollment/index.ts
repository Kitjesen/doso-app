import { authenticate } from "../_shared/auth.ts";
import {
  createRobotDeviceEnrollmentHandler,
} from "../_shared/robotDeviceEnrollment.ts";
import { webCryptoEd25519Verifier } from "../_shared/robotIngress.ts";

const handler = createRobotDeviceEnrollmentHandler({
  authenticate: async (request) => {
    const { caller, db } = await authenticate(request);
    return {
      userId: caller.user.id,
      sessionId: caller.sessionId,
      db,
    };
  },
  verifier: webCryptoEd25519Verifier,
});

Deno.serve(handler);
