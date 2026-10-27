import { authenticate } from "../_shared/auth.ts";
import { handleAccountDeletionPreview } from "./preview.ts";

// Local candidate only. Do not deploy/enable before reviewed SQL and shared
// Auth-session authority are installed and verified with explicit approval.
Deno.serve((request) =>
  handleAccountDeletionPreview(request, { authenticate })
);
