import { HttpError } from "./http.ts";

export const AUTH_USER_SCAN_PAGE_SIZE = 1_000;
export const MAX_AUTH_USERS_TO_SCAN = 10_000;
export const PROFILE_LOOKUP_BATCH_SIZE = 200;

export type AuthUserRecord = Record<string, unknown>;
export type ProfileRecord = Record<string, unknown>;
export type DirectoryUserRecord = AuthUserRecord & {
  profile: ProfileRecord | null;
};

export interface AuthUserPage {
  users: AuthUserRecord[];
  total: number;
}

export async function scanAuthUsers(
  listPage: (page: number, perPage: number) => Promise<AuthUserPage>,
): Promise<AuthUserRecord[]> {
  const users: AuthUserRecord[] = [];
  const maximumPages = Math.ceil(
    MAX_AUTH_USERS_TO_SCAN / AUTH_USER_SCAN_PAGE_SIZE,
  );

  for (let page = 1; page <= maximumPages; page += 1) {
    const result = await listPage(page, AUTH_USER_SCAN_PAGE_SIZE);
    if (result.total > MAX_AUTH_USERS_TO_SCAN) {
      throw new HttpError(
        413,
        "user_directory_too_large",
        `User search is limited to ${MAX_AUTH_USERS_TO_SCAN} accounts. Use a narrower administrative export or external directory index.`,
      );
    }
    users.push(...result.users);
    if (
      result.users.length < AUTH_USER_SCAN_PAGE_SIZE ||
      users.length >= result.total
    ) {
      return users;
    }
  }

  if (users.length >= MAX_AUTH_USERS_TO_SCAN) {
    throw new HttpError(
      413,
      "user_directory_too_large",
      `User search is limited to ${MAX_AUTH_USERS_TO_SCAN} accounts. Use a narrower administrative export or external directory index.`,
    );
  }
  return users;
}

export async function loadProfilesByUserId(
  userIds: string[],
  loadBatch: (userIds: string[]) => Promise<ProfileRecord[]>,
): Promise<Map<string, ProfileRecord>> {
  const uniqueIds = [...new Set(userIds.filter(Boolean))];
  if (uniqueIds.length > MAX_AUTH_USERS_TO_SCAN) {
    throw new HttpError(
      413,
      "user_directory_too_large",
      `User search is limited to ${MAX_AUTH_USERS_TO_SCAN} accounts. Use a narrower administrative export or external directory index.`,
    );
  }

  const profileById = new Map<string, ProfileRecord>();
  for (
    let offset = 0;
    offset < uniqueIds.length;
    offset += PROFILE_LOOKUP_BATCH_SIZE
  ) {
    const profiles = await loadBatch(
      uniqueIds.slice(offset, offset + PROFILE_LOOKUP_BATCH_SIZE),
    );
    for (const profile of profiles) {
      const id = String(profile.id ?? "");
      if (id) profileById.set(id, profile);
    }
  }
  return profileById;
}

export function mergeAuthUsersWithProfiles(
  users: AuthUserRecord[],
  profileById: Map<string, ProfileRecord>,
): DirectoryUserRecord[] {
  return users.map((user) => ({
    ...user,
    profile: profileById.get(String(user.id ?? "")) ?? null,
  }));
}

export function filterAndPageDirectoryUsers(
  users: DirectoryUserRecord[],
  search: string,
  page: number,
  perPage: number,
): { users: DirectoryUserRecord[]; total: number } {
  const normalized = search.trim().toLowerCase();
  const matches = users.filter((user) => {
    const email = String(user.email ?? "").toLowerCase();
    const username = String(user.profile?.username ?? "").toLowerCase();
    return email.includes(normalized) || username.includes(normalized);
  });
  const from = (page - 1) * perPage;
  return {
    users: matches.slice(from, from + perPage),
    total: matches.length,
  };
}
