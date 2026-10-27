import { PostgrestClient } from '@supabase/postgrest-js';

import type { Database } from '../types/api';
import { runAuthSessionOperation } from './authSessionOperation';
import { getSupabaseClient, supabaseConfig, SupabaseConfigurationError } from './supabaseClient';

/** Device REST only. Auth settles before a query exists; network wait owns no Auth lease. */
export async function runDeviceDataQuery<T>(
  expectedUserId: string,
  query: (client: PostgrestClient<Database>) => PromiseLike<{ data: T | null; error: unknown }>,
): Promise<T> {
  if (!supabaseConfig.url || !supabaseConfig.publishableKey) throw new SupabaseConfigurationError();
  const token = await runAuthSessionOperation(async () => {
    const { data, error } = await getSupabaseClient().auth.getSession();
    if (error) throw error;
    if (!data.session?.access_token || data.session.user.id !== expectedUserId) {
      throw new Error('当前账户已变化，请重新加载设备。');
    }
    return data.session.access_token;
  }, { kind: 'session-read' });

  // Request-local credentials only: no Auth/Realtime construction, token cache,
  // or authenticated Supabase fetch that could implicitly read Auth again.
  const client = new PostgrestClient<Database>(
    new URL('rest/v1', `${supabaseConfig.url.replace(/\/+$/, '')}/`).href,
    { fetch, schema: 'public', headers: { apikey: supabaseConfig.publishableKey, Authorization: `Bearer ${token}` } },
  );
  const { data, error } = await query(client);
  if (error) throw error;
  return data as T;
}
