import * as Crypto from 'expo-crypto';
import { PostgrestClient } from '@supabase/postgrest-js';
import { StorageClient } from '@supabase/storage-js';

import type { Database, Profile } from '../types/api';
import { runAuthSessionOperation } from './authSessionOperation';
import { profileAvatarJournal } from './profileAvatarJournal';
import { AvatarJournalError, planAvatarJournalResume } from './profileAvatarJournalCore';
import {
  isReturnedProfile,
  normalizeProfileDisplayName,
  normalizeProfileUsername,
  parseOwnedProfileAvatarValue,
  persistedProfileAvatarValue,
  prepareProfileAvatar,
  PROFILE_AVATAR_BUCKET,
  PROFILE_AVATAR_SIGNED_URL_SECONDS,
  profileAvatarObjectPath,
  type ProfileAvatarSelection,
  type ProfileEditInput,
} from './profileEditingCore';
import { getSupabaseClient, supabaseConfig, SupabaseConfigurationError } from './supabaseClient';

export type { ProfileAvatarSelection, ProfileEditInput } from './profileEditingCore';

const PROFILE_EDIT_TIMEOUT_MS = 20_000;
const PROFILE_AVATAR_CLEANUP_TIMEOUT_MS = 3_000;

export type ProfileAvatarCleanup = 'not-needed' | 'removed' | 'already-absent' | 'protected-current' | 'pending';
export type ProfileEditResult = { profile: Profile; avatarCleanup: ProfileAvatarCleanup };

type ProfileEditRpcArgs = {
  p_expected_user_id: string;
  p_username: string;
  p_display_name: string;
  p_avatar_action: 'keep' | 'replace' | 'remove';
  p_avatar_path: string | null;
};

type ProfileAvatarCleanupProof = {
  status: 'retired' | 'retired-missing' | 'protected-current';
  ownerId: string;
  objectPath: string;
};

export class ProfileEditTimeoutError extends Error {
  readonly outcomeMayBeUnknown = true;

  constructor(operation: string) {
    super(`${operation}超时，结果可能仍在处理中。请刷新个人资料后再重试。`);
    this.name = 'ProfileEditTimeoutError';
  }
}

export class ProfileEditCleanupError extends Error {
  readonly avatarCleanup = 'pending';

  constructor(original: unknown) {
    super(`${original instanceof Error ? original.message : '个人资料未保存。'} 本次上传的头像清理尚未确认。`);
    this.name = 'ProfileEditCleanupError';
  }
}

function withTimeout<T>(promise: PromiseLike<T>, operation: string, timeoutMs = PROFILE_EDIT_TIMEOUT_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new ProfileEditTimeoutError(operation)),
      timeoutMs,
    );
    Promise.resolve(promise).then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/** Only token reads own Auth; an absolute cutoff can share cleanup's budget. */
async function runProfileRequest<T>(
  expectedUserId: string,
  operation: string,
  request: (url: string, headers: Record<string, string>) => PromiseLike<T>,
  absoluteDeadlineMs = performance.now() + PROFILE_EDIT_TIMEOUT_MS,
): Promise<T> {
  const { url, publishableKey } = supabaseConfig;
  if (!url || !publishableKey) throw new SupabaseConfigurationError();
  const remaining = () => {
    const budget = absoluteDeadlineMs - performance.now();
    if (budget <= 0) throw new ProfileEditTimeoutError(operation);
    return budget;
  };
  const token = await runAuthSessionOperation(async lease => {
    const budget = remaining();
    const { data, error } = await withTimeout(
      lease.retain(() => getSupabaseClient().auth.getSession()), operation, budget,
    );
    if (error) throw error;
    if (!data.session?.access_token || data.session.user.id !== expectedUserId) {
      throw new Error('当前账户与待编辑资料不一致，请重新登录。');
    }
    return data.session.access_token;
  }, { kind: 'session-read' });
  // A timed-out Auth await rejects above: its retained SDK may settle later,
  // but this continuation will never construct a late Data/Storage request.
  const budget = remaining();
  return withTimeout(request(`${url.replace(/\/+$/, '')}/`, {
    apikey: publishableKey, Authorization: `Bearer ${token}`,
  }), operation, budget);
}

function profileEditError(error: { message?: string; code?: string }) {
  const message = `${error.code ?? ''} ${error.message ?? ''}`;
  if (/username_taken|duplicate key/i.test(message)) return new Error('该用户名已被使用。');
  if (/username_reserved/i.test(message)) return new Error('该用户名不可使用，请更换后重试。');
  if (/username_invalid/i.test(message)) return new Error('用户名需为 3–24 位小写字母、数字或下划线。');
  if (/display_name_invalid/i.test(message)) return new Error('昵称需为 1–50 个字符，且不能包含控制字符。');
  if (/avatar_retired/i.test(message)) return new Error('该头像已进入清理，请重新选择图片。');
  if (/avatar_path_invalid|avatar_object_missing/i.test(message)) return new Error('头像存储路径无效，请重新选择。');
  if (/avatar_quota_exceeded/i.test(message)) return new Error('头像存储空间已满，请稍后清理旧头像后重试。');
  if (/profile_identity_mismatch/i.test(message)) return new Error('登录账户已经变化，未保存本次修改。');
  if (/account_or_session_inactive|authentication_required/i.test(message)) return new Error('当前登录已失效，请重新登录。');
  if (/update_my_profile|function .* does not exist|schema cache/i.test(message)) {
    return new Error('个人资料编辑服务尚未部署，请更新服务后重试。');
  }
  return new Error(error.message || '个人资料保存失败，请稍后重试。');
}

function isDefinitiveProfileRollback(error: { message?: string; code?: string }) {
  const code = error.code ?? '';
  const message = error.message ?? '';
  if (code === 'P0001' && message === 'username_taken') return true;
  if (code === '42501' && message === 'profile_identity_mismatch') return true;
  return code === '22023' && new Set([
    'username_invalid',
    'username_reserved',
    'display_name_invalid',
    'avatar_action_invalid',
    'avatar_path_invalid',
    'avatar_object_missing',
    'avatar_retired',
  ]).has(message);
}

function parseProfileAvatarCleanupProof(
  value: unknown,
  expectedUserId: string,
  objectPath: string,
): ProfileAvatarCleanupProof | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const proof = value as Record<string, unknown>;
  if (proof.ownerId !== expectedUserId || proof.objectPath !== objectPath) return null;
  if (proof.status !== 'retired' && proof.status !== 'retired-missing'
    && proof.status !== 'protected-current') return null;
  return proof as ProfileAvatarCleanupProof;
}

async function removeAvatarBestEffort(expectedUserId: string, objectPath: string | null): Promise<ProfileAvatarCleanup> {
  if (!objectPath) return 'not-needed';
  if (parseOwnedProfileAvatarValue(persistedProfileAvatarValue(objectPath), expectedUserId) !== objectPath) return 'pending';
  const deadline = performance.now() + PROFILE_AVATAR_CLEANUP_TIMEOUT_MS;
  const withinDeadline = <T>(request: () => PromiseLike<T>, operation: string): Promise<T> => {
    const remaining = deadline - performance.now();
    if (remaining <= 0) throw new ProfileEditTimeoutError(operation);
    // Check the deadline BEFORE starting a request, especially a DELETE.
    return withTimeout(request(), operation, remaining);
  };
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await withinDeadline(() => assertExpectedUser(expectedUserId, PROFILE_AVATAR_CLEANUP_TIMEOUT_MS), '清理账户校验');
      const prepared = await runProfileRequest(
        expectedUserId, '头像清理准备',
        (url, headers) => new PostgrestClient<Database>(new URL('rest/v1', url).href, {
          headers, fetch, schema: 'public',
        }).rpc('prepare_my_profile_avatar_cleanup', {
          p_expected_user_id: expectedUserId,
          p_object_path: objectPath,
        }),
        deadline,
      );
      if (prepared.error !== null) return 'pending';
      const proof = parseProfileAvatarCleanupProof(prepared.data, expectedUserId, objectPath);
      if (!proof) return 'pending';
      if (proof.status === 'protected-current') return 'protected-current';
      if (proof.status === 'retired-missing') return 'already-absent';
      await withinDeadline(() => assertExpectedUser(expectedUserId, PROFILE_AVATAR_CLEANUP_TIMEOUT_MS), '清理账户校验');
      const { data, error } = await runProfileRequest(
        expectedUserId, '头像清理',
        (url, headers) => new StorageClient(new URL('storage/v1', url).href, headers, fetch)
          .from(PROFILE_AVATAR_BUCKET).remove([objectPath]),
        deadline,
      );
      // Retry a returned server failure only once with fresh checks, sharing
      // the same total deadline. Throws/timeouts never repeat an in-flight DELETE.
      if (error && attempt === 0 && ['500', '502', '503', '504'].includes(String(error.statusCode))) continue;
      // Require the complete success contract. Missing/malformed error fields
      // and empty/unrelated results are not evidence; RLS may filter the row.
      return error === null && Array.isArray(data) && data.some(object => object?.name === objectPath)
        ? 'removed' : 'pending';
    } catch {
      return 'pending';
    }
  }
  return 'pending';
}

async function assertExpectedUser(expectedUserId: string, timeoutMs = PROFILE_EDIT_TIMEOUT_MS) {
  return runAuthSessionOperation(async lease => {
    // The SDK read can refresh/write auth storage. A caller timeout must not
    // release that work; retain the actual SDK promise before bounding its wait.
    const { data, error } = await withTimeout(
      lease.retain(() => getSupabaseClient().auth.getUser()), '账户校验', timeoutMs,
    );
    if (error) throw error;
    if (!data.user || data.user.id !== expectedUserId) {
      throw new Error('当前账户与待编辑资料不一致，请重新登录。');
    }
  }, { kind: 'session-read' });
}

async function finishAvatarOperation(
  expectedUserId: string,
  operationId: string,
  phase: 'committed' | 'rolled-back',
  cleanupPath: string | null,
  phaseAlreadyRecorded = false,
): Promise<ProfileAvatarCleanup> {
  try {
    // Persist the known outcome BEFORE cleanup. If this fails, retain the
    // uncertain record; a verified profile commit is still a successful save.
    if (!phaseAlreadyRecorded) await profileAvatarJournal.mark(expectedUserId, operationId, phase);
    const cleanup = await removeAvatarBestEffort(expectedUserId, cleanupPath);
    if (cleanup === 'pending' || cleanup === 'protected-current') return cleanup;
    await assertExpectedUser(expectedUserId, PROFILE_AVATAR_CLEANUP_TIMEOUT_MS);
    const { data, error } = await runProfileRequest(
      expectedUserId, '清理后资料校验',
      (url, headers) => new PostgrestClient<Database>(new URL('rest/v1', url).href, {
        headers, fetch, schema: 'public',
      }).from('profiles').select('avatar_url').eq('id', expectedUserId).maybeSingle(),
      performance.now() + PROFILE_AVATAR_CLEANUP_TIMEOUT_MS,
    );
    if (error || !data || (data.avatar_url !== null && typeof data.avatar_url !== 'string')) return 'pending';
    await assertExpectedUser(expectedUserId, PROFILE_AVATAR_CLEANUP_TIMEOUT_MS);
    await profileAvatarJournal.clearResolved(expectedUserId, operationId, {
      phase, cleanupPath, currentAvatarValue: data.avatar_url, outcome: cleanup,
    });
    return cleanup;
  } catch {
    return 'pending';
  }
}

export async function saveProfileEdits(
  expectedUserId: string,
  input: ProfileEditInput,
): Promise<ProfileEditResult> {
  const username = normalizeProfileUsername(input.username);
  const displayName = normalizeProfileDisplayName(input.displayName);
  await assertExpectedUser(expectedUserId);
  const client = getSupabaseClient();
  const pendingAvatar = await profileAvatarJournal.read(expectedUserId);
  const { data: currentProfile, error: currentProfileError } = await runProfileRequest(
    expectedUserId, '个人资料读取', (url, headers) => new PostgrestClient<Database>(
      new URL('rest/v1', url).href, { headers, fetch, schema: 'public' },
    ).from('profiles').select('avatar_url').eq('id', expectedUserId).maybeSingle(),
  );
  if (currentProfileError) throw new Error(currentProfileError.message || '个人资料读取失败。');
  if (!currentProfile) throw new Error('未找到当前个人资料。');
  if (currentProfile.avatar_url !== null && typeof currentProfile.avatar_url !== 'string') {
    throw new Error('当前头像资料无法验证，未开始保存。');
  }
  if (pendingAvatar) {
    // Recovery is a separate attempt. Never replay the current form after
    // recovering an earlier, potentially committed request.
    await assertExpectedUser(expectedUserId);
    if (pendingAvatar.phase === 'prepared') {
      // Cancellation and arm compete under the SAME store lock. If the old
      // caller already armed, cancellation fails and its record is retained.
      await profileAvatarJournal.cancelPrepared(expectedUserId, pendingAvatar.operationId);
      throw new AvatarJournalError('上次未发送的头像操作已撤销，本次未提交修改。请确认资料后重新保存。');
    }
    const decision = planAvatarJournalResume(pendingAvatar, currentProfile.avatar_url);
    if (decision.kind === 'confirmed') {
      const cleanup = await finishAvatarOperation(
        expectedUserId, pendingAvatar.operationId, decision.phase, decision.cleanupPath,
      );
      if (cleanup === 'removed' || cleanup === 'already-absent' || cleanup === 'not-needed') {
        throw new AvatarJournalError('上次头像操作已核对，请返回“我的”刷新确认后再保存。');
      }
    }
    throw new AvatarJournalError('上次头像操作结果或清理尚未确认，本次未提交修改。请稍后返回“我的”刷新确认。');
  }

  const previousObjectPath = parseOwnedProfileAvatarValue(currentProfile.avatar_url, expectedUserId);
  let journalOperationId: string | null = null;
  const beginAvatarOperation = async (candidatePath: string | null) => {
    const operationId = Crypto.randomUUID();
    await profileAvatarJournal.beginPrepared(expectedUserId, operationId, candidatePath, previousObjectPath);
    journalOperationId = operationId;
    return operationId;
  };
  let uploadedObjectPath: string | null = null;
  let avatarDispatched = false;
  let avatarAction: ProfileEditRpcArgs['p_avatar_action'] = 'keep';
  let avatarPath: string | null = null;
  if (input.avatar === null) {
    if (previousObjectPath) await beginAvatarOperation(null);
    else if (await profileAvatarJournal.read(expectedUserId)) {
      throw new AvatarJournalError('上次头像操作仍待确认或清理，未开始新的头像操作。');
    }
    avatarAction = 'remove';
  } else if (input.avatar !== undefined) {
    const prepared = prepareProfileAvatar(input.avatar);
    const candidateObjectPath = profileAvatarObjectPath(expectedUserId, Crypto.randomUUID(), prepared.extension);
    uploadedObjectPath = candidateObjectPath;
    const uploadBody = prepared.bytes.slice().buffer;
    // A durable occupied slot must be verified before any avatar write.
    const operationId = await beginAvatarOperation(candidateObjectPath);
    await assertExpectedUser(expectedUserId);
    await profileAvatarJournal.arm(expectedUserId, operationId);
    // Arm can wait for the persistence lock/readback. Never dispatch using the
    // identity observed before that wait. A failed recheck keeps uncertain intent.
    await assertExpectedUser(expectedUserId);
    avatarDispatched = true;
    const { error: uploadError } = await runProfileRequest(
      expectedUserId, '头像上传',
      (url, headers) => new StorageClient(new URL('storage/v1', url).href, headers, fetch)
        .from(PROFILE_AVATAR_BUCKET).upload(candidateObjectPath, uploadBody, {
          contentType: prepared.mimeType,
          cacheControl: '3600',
          upsert: false,
        }),
    );
    if (uploadError) {
      if (/avatar_quota_exceeded/i.test(uploadError.message)) {
        throw new Error('头像存储空间已满，请稍后清理旧头像后重试。');
      }
      throw /bucket|not found|row-level security/i.test(uploadError.message)
        ? new Error('头像存储服务尚未部署或当前会话无上传权限。')
        : new Error(uploadError.message || '头像上传失败，请稍后重试。');
    }
    avatarAction = 'replace';
    avatarPath = persistedProfileAvatarValue(uploadedObjectPath);
  }

  const args: ProfileEditRpcArgs = {
    p_expected_user_id: expectedUserId,
    p_username: username,
    p_display_name: displayName,
    p_avatar_action: avatarAction,
    p_avatar_path: avatarPath,
  };
  let result: { data: Profile | null; error: { message?: string; code?: string } | null };
  try {
    await assertExpectedUser(expectedUserId);
    if (journalOperationId && avatarAction === 'remove') {
      await profileAvatarJournal.arm(expectedUserId, journalOperationId);
      await assertExpectedUser(expectedUserId);
      avatarDispatched = true;
    }
  } catch (error) {
    // The profile RPC has not started, so a newly uploaded object is certainly
    // unreferenced. Account/ref checks still fence cleanup after auth failure.
    const cleanup = journalOperationId && avatarDispatched
      ? await finishAvatarOperation(expectedUserId, journalOperationId, 'rolled-back', uploadedObjectPath)
      : 'not-needed';
    if (cleanup === 'pending') throw new ProfileEditCleanupError(error);
    throw error;
  }
  try {
    result = await runProfileRequest(
      expectedUserId, '个人资料保存',
      (url, headers) => new PostgrestClient<Database>(new URL('rest/v1', url).href, {
        headers, fetch, schema: 'public',
      }).rpc('update_my_profile', args),
    );
  } catch (error) {
    // A transport timeout can race a committed transaction. Do not delete the
    // upload without a confirmed terminal outcome and fresh reference checks.
    throw error;
  }
  if (result.error) {
    if (isDefinitiveProfileRollback(result.error)) {
      // These exact PostgreSQL exceptions prove the transaction rolled back.
      // Storage DELETE policy still protects an object if it somehow became
      // the current profile reference before this cleanup request arrives.
      const cleanup = journalOperationId
        ? await finishAvatarOperation(expectedUserId, journalOperationId, 'rolled-back', uploadedObjectPath)
        : 'not-needed';
      if (cleanup === 'pending') throw new ProfileEditCleanupError(profileEditError(result.error));
    }
    // Unknown gateway/network failures can arrive after a commit, so those
    // objects remain untouched until their outcome is reconciled.
    throw profileEditError(result.error);
  }
  if (result.error !== null) {
    throw new Error('个人资料可能已保存，但服务返回结果无法验证。请刷新后确认。');
  }
  // An error-free completed RPC is distinct from an unverifiable response
  // shape. Record completion now (including remove where candidate is null),
  // but never clean up until the returned profile is validated below.
  let commitRecorded = false;
  if (journalOperationId) {
    try {
      await profileAvatarJournal.mark(expectedUserId, journalOperationId, 'committed');
      commitRecorded = true;
    } catch {
      // Keep the record and suppress cleanup; do not turn a verified save
      // below into a failure merely because its local confirmation failed.
    }
  }
  if (!isReturnedProfile(result.data, expectedUserId)) {
    // The server may have committed despite an incompatible response shape.
    // Preserve the uploaded object and require a refresh rather than guessing.
    throw new Error('个人资料可能已保存，但服务返回结果无法验证。请刷新后确认。');
  }
  if (result.data.username !== username || result.data.display_name !== displayName) {
    throw new Error('个人资料返回值与保存内容不一致，请刷新后确认。');
  }
  if (avatarAction === 'replace' && result.data.avatar_url !== avatarPath) {
    throw new Error('头像可能已上传，但个人资料返回值无法验证。请刷新后确认。');
  }
  if (avatarAction === 'remove' && result.data.avatar_url !== null) {
    throw new Error('头像移除结果无法验证，请刷新后确认。');
  }

  let avatarCleanup: ProfileAvatarCleanup = 'not-needed';
  if (journalOperationId) {
    // The database DELETE policy rejects this cleanup if another concurrent
    // edit has made the previous object current again.
    avatarCleanup = commitRecorded
      ? await finishAvatarOperation(expectedUserId, journalOperationId, 'committed', previousObjectPath, true)
      : 'pending';
  }
  return { profile: result.data, avatarCleanup };
}

export async function resolveProfileAvatarUrl(avatarValue: string | null, userId: string) {
  const objectPath = parseOwnedProfileAvatarValue(avatarValue, userId);
  if (!objectPath) return null;
  const { data, error } = await runProfileRequest(
    userId, '头像读取', (url, headers) => new StorageClient(
      new URL('storage/v1', url).href, headers, fetch,
    ).from(PROFILE_AVATAR_BUCKET).createSignedUrl(
      objectPath,
      PROFILE_AVATAR_SIGNED_URL_SECONDS,
    ),
  );
  if (error) {
    if (/bucket|not found|row-level security/i.test(error.message)) {
      throw new Error('头像存储服务尚未部署或当前会话无读取权限。');
    }
    throw new Error(error.message || '头像读取失败，请稍后重试。');
  }
  return data.signedUrl;
}
