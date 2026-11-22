import * as jose from 'jsr:@panva/jose@6';
import { createClient } from 'npm:@supabase/supabase-js@2.112.3';

// No account clients or requests: this one-shot probe only resolves runtime imports.
Deno.serve(() => Response.json({
  status: 'doso_function_imports_ready',
  jose: typeof jose.jwtVerify === 'function',
  supabase: typeof createClient === 'function',
}));
