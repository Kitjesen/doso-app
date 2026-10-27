const UPSTREAM_PROVIDER_TOKEN_KEYS = new Set([
  'provider_token',
  'provider_refresh_token',
]);

export type SanitizedAuthStorageValue = {
  value: string;
  changed: boolean;
};

function removeUpstreamProviderTokens(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.reduce(
      (changed, item) => removeUpstreamProviderTokens(item) || changed,
      false,
    );
  }

  if (value === null || typeof value !== 'object') return false;

  let changed = false;
  for (const key of Object.keys(value)) {
    if (UPSTREAM_PROVIDER_TOKEN_KEYS.has(key)) {
      delete (value as Record<string, unknown>)[key];
      changed = true;
      continue;
    }
    changed = removeUpstreamProviderTokens((value as Record<string, unknown>)[key]) || changed;
  }
  return changed;
}

export function sanitizeAuthStorageValue(value: string): SanitizedAuthStorageValue {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return { value, changed: false };
  }

  if (!removeUpstreamProviderTokens(parsed)) {
    return { value, changed: false };
  }

  return { value: JSON.stringify(parsed), changed: true };
}
