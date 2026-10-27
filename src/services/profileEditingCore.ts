import type { Profile } from '../types/api';

export const PROFILE_AVATAR_BUCKET = 'profile-avatars';
export const PROFILE_AVATAR_MAX_BYTES = 3 * 1024 * 1024;
export const PROFILE_AVATAR_SIGNED_URL_SECONDS = 60 * 60;

const USERNAME_PATTERN = /^[a-z0-9_]{3,24}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RESERVED_USERNAMES = new Set([
  'account', 'accounts', 'admin', 'administrator', 'api', 'auth',
  'doso', 'help', 'login', 'me', 'moderator', 'null', 'official',
  'register', 'robot', 'robotics', 'root', 'security', 'signup',
  'staff', 'support', 'system', 'undefined',
]);

export type ProfileAvatarMimeType = 'image/jpeg' | 'image/png';

export type ProfileAvatarSelection = {
  uri: string;
  base64: string;
  mimeType: ProfileAvatarMimeType;
};

export type ProfileEditInput = {
  username: string;
  displayName: string;
  avatar?: ProfileAvatarSelection | null;
};

export type PreparedProfileAvatar = {
  bytes: Uint8Array;
  extension: 'jpg' | 'png';
  mimeType: ProfileAvatarMimeType;
};

export function normalizeProfileUsername(value: string) {
  const normalized = value.trim().toLowerCase();
  if (!USERNAME_PATTERN.test(normalized)) {
    throw new Error('用户名需为 3–24 位小写字母、数字或下划线。');
  }
  if (RESERVED_USERNAMES.has(normalized)) {
    throw new Error('该用户名不可使用，请更换后重试。');
  }
  return normalized;
}

export function normalizeProfileDisplayName(value: string) {
  const normalized = value.trim();
  if (normalized.length < 1 || normalized.length > 50) {
    throw new Error('昵称需为 1–50 个字符。');
  }
  if (/\p{Cc}/u.test(normalized)) {
    throw new Error('昵称不能包含控制字符。');
  }
  return normalized;
}

function decodeBase64(base64: string) {
  const normalized = base64.replace(/\s+/g, '');
  if (!normalized || normalized.length % 4 === 1 || !/^[A-Za-z0-9+/]*={0,2}$/.test(normalized)) {
    throw new Error('头像文件数据无效，请重新选择。');
  }

  const padding = normalized.endsWith('==') ? 2 : normalized.endsWith('=') ? 1 : 0;
  const byteLength = Math.floor((normalized.length * 3) / 4) - padding;
  if (byteLength <= 0 || byteLength > PROFILE_AVATAR_MAX_BYTES) {
    throw new Error('头像文件需小于或等于 3 MiB。');
  }

  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const bytes = new Uint8Array(byteLength);
  let outputIndex = 0;
  for (let index = 0; index < normalized.length; index += 4) {
    const a = alphabet.indexOf(normalized[index]);
    const b = alphabet.indexOf(normalized[index + 1]);
    const c = normalized[index + 2] === '=' ? 0 : alphabet.indexOf(normalized[index + 2]);
    const d = normalized[index + 3] === '=' ? 0 : alphabet.indexOf(normalized[index + 3]);
    if (a < 0 || b < 0 || c < 0 || d < 0) throw new Error('头像文件数据无效，请重新选择。');
    const chunk = (a << 18) | (b << 12) | (c << 6) | d;
    if (outputIndex < byteLength) bytes[outputIndex++] = (chunk >> 16) & 0xff;
    if (outputIndex < byteLength) bytes[outputIndex++] = (chunk >> 8) & 0xff;
    if (outputIndex < byteLength) bytes[outputIndex++] = chunk & 0xff;
  }
  return bytes;
}

export function prepareProfileAvatar(selection: ProfileAvatarSelection): PreparedProfileAvatar {
  if (!selection.uri.trim()) throw new Error('头像来源无效，请重新选择。');
  if (selection.mimeType !== 'image/jpeg' && selection.mimeType !== 'image/png') {
    throw new Error('头像仅支持 JPEG 或 PNG 格式。');
  }
  const bytes = decodeBase64(selection.base64);
  const isJpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const isPng = bytes.length >= 8
    && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
    && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a;

  if (selection.mimeType === 'image/jpeg' && !isJpeg) {
    throw new Error('头像内容与 JPEG 类型不一致，请重新选择。');
  }
  if (selection.mimeType === 'image/png' && !isPng) {
    throw new Error('头像内容与 PNG 类型不一致，请重新选择。');
  }
  return {
    bytes,
    extension: selection.mimeType === 'image/jpeg' ? 'jpg' : 'png',
    mimeType: selection.mimeType,
  };
}

export function profileAvatarObjectPath(userId: string, objectId: string, extension: 'jpg' | 'png') {
  if (!UUID_PATTERN.test(userId) || !UUID_PATTERN.test(objectId)) {
    throw new Error('头像对象标识无效。');
  }
  return `${userId}/${objectId}.${extension}`;
}

export function persistedProfileAvatarValue(objectPath: string) {
  return `${PROFILE_AVATAR_BUCKET}/${objectPath}`;
}

export function parseOwnedProfileAvatarValue(value: string | null, userId: string) {
  if (!value || !UUID_PATTERN.test(userId)) return null;
  const escapedUserId = userId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = value.match(new RegExp(`^${PROFILE_AVATAR_BUCKET}/(${escapedUserId}/[0-9a-f-]{36}\\.(?:jpg|png))$`, 'i'));
  if (!match || !new RegExp(`^${escapedUserId}/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\\.(?:jpg|png)$`, 'i').test(match[1])) {
    return null;
  }
  return match[1];
}

export function isReturnedProfile(value: unknown, expectedUserId: string): value is Profile {
  if (!value || typeof value !== 'object') return false;
  const profile = value as Partial<Profile>;
  return profile.id === expectedUserId
    && typeof profile.email === 'string'
    && typeof profile.username === 'string'
    && (profile.username_claimed_at === null || typeof profile.username_claimed_at === 'string')
    && ['registration', 'manual_claim', 'admin_verified', 'legacy_inferred', 'social_provisional']
      .includes(profile.username_provenance ?? '')
    && typeof profile.display_name === 'string'
    && (profile.avatar_url === null || typeof profile.avatar_url === 'string')
    && ['user', 'support', 'admin'].includes(profile.app_role ?? '')
    && ['active', 'suspended', 'deleting'].includes(profile.account_status ?? '')
    && (profile.suspended_at === null || typeof profile.suspended_at === 'string')
    && (profile.suspension_reason === null || typeof profile.suspension_reason === 'string')
    && typeof profile.created_at === 'string'
    && typeof profile.updated_at === 'string';
}
