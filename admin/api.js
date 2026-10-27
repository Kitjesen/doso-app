import { accountSessionsRequest, mfaAuthRequest } from './contracts.js';

const SESSION_KEY = 'doso.admin.session.v1';
const CONFIG_KEY = 'doso.admin.config.v1';
const INSTALLATION_KEY = 'doso.admin.installation.v1';

export class ApiError extends Error {
  constructor(message, status = 0, details = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

function normalizeUrl(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

export function validateSupabaseUrl(value) {
  const raw = String(value || '').trim();
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new ApiError('请输入有效的 Supabase URL');
  }
  const isLoopback = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname.toLowerCase());
  if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && isLoopback)) {
    throw new ApiError('生产 Supabase URL 必须使用 HTTPS；HTTP 仅允许 localhost、127.0.0.1 或 [::1]');
  }
  if (parsed.username || parsed.password) throw new ApiError('Supabase URL 不能包含用户名或密码');
  if (parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new ApiError('Supabase URL 只能填写项目根地址，不能包含路径、查询参数或片段');
  }
  return parsed.origin;
}

function readJson(key) {
  try {
    return JSON.parse(sessionStorage.getItem(key) || 'null');
  } catch {
    return null;
  }
}

function installationId() {
  const existing = sessionStorage.getItem(INSTALLATION_KEY);
  if (existing) return existing;
  const value = globalThis.crypto?.randomUUID?.() || `web-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  sessionStorage.setItem(INSTALLATION_KEY, value);
  return value;
}

async function parseResponse(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

function errorMessage(body, fallback) {
  return body?.error_description || body?.msg || body?.message || body?.error?.message ||
    (typeof body?.error === 'string' ? body.error : null) || fallback;
}

function decodeJwtPayload(token) {
  try {
    const segment = String(token || '').split('.')[1];
    if (!segment) return null;
    const base64 = segment.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(segment.length / 4) * 4, '=');
    const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}

export class DosoAdminApi {
  constructor() {
    this.config = readJson(CONFIG_KEY) || {
      supabaseUrl: normalizeUrl(window.DOSO_ADMIN_CONFIG?.supabaseUrl),
      publishableKey: String(window.DOSO_ADMIN_CONFIG?.publishableKey || '').trim(),
    };
    this.session = readJson(SESSION_KEY);
    this.refreshPromise = null;
  }

  saveConfig(supabaseUrl, publishableKey) {
    const url = validateSupabaseUrl(supabaseUrl);
    const key = String(publishableKey || '').trim();
    if (!key) throw new ApiError('请输入 publishable key');
    this.config = { supabaseUrl: url, publishableKey: key };
    sessionStorage.setItem(CONFIG_KEY, JSON.stringify(this.config));
  }

  hasSession() {
    return Boolean(this.session?.access_token && this.session?.refresh_token);
  }

  getUser() {
    return this.session?.user || null;
  }

  getAssuranceLevel() {
    return decodeJwtPayload(this.session?.access_token)?.aal || 'aal1';
  }

  hasAal2() {
    return this.getAssuranceLevel() === 'aal2';
  }

  async login(email, password) {
    const response = await fetch(`${this.config.supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        apikey: this.config.publishableKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email: String(email || '').trim(), password }),
    });
    const body = await parseResponse(response);
    if (!response.ok) throw new ApiError(errorMessage(body, '登录失败'), response.status, body);
    this.setSession(body);
    return body;
  }

  async logout() {
    const token = this.session?.access_token;
    try {
      if (token) {
        await fetch(`${this.config.supabaseUrl}/auth/v1/logout?scope=local`, {
          method: 'POST',
          headers: { apikey: this.config.publishableKey, Authorization: `Bearer ${token}` },
        });
      }
    } finally {
      this.clearSession();
    }
  }

  setSession(session) {
    this.session = session;
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  }

  clearSession() {
    this.session = null;
    sessionStorage.removeItem(SESSION_KEY);
  }

  async refresh() {
    if (this.refreshPromise) return this.refreshPromise;
    if (!this.session?.refresh_token) throw new ApiError('登录已过期，请重新登录', 401);
    this.refreshPromise = (async () => {
      const response = await fetch(`${this.config.supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
        method: 'POST',
        headers: { apikey: this.config.publishableKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: this.session.refresh_token }),
      });
      const body = await parseResponse(response);
      if (!response.ok) {
        this.clearSession();
        throw new ApiError('登录已过期，请重新登录', 401, body);
      }
      this.setSession(body);
      return body;
    })().finally(() => {
      this.refreshPromise = null;
    });
    return this.refreshPromise;
  }

  async authenticatedRequest(path, options = {}) {
    if (!this.hasSession()) throw new ApiError('请先登录', 401);
    const response = await fetch(`${this.config.supabaseUrl}/auth/v1${path}`, {
      ...options,
      headers: {
        apikey: this.config.publishableKey,
        Authorization: `Bearer ${this.session.access_token}`,
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers || {}),
      },
    });
    const body = await parseResponse(response);
    if (!response.ok) throw new ApiError(errorMessage(body, '身份验证请求失败'), response.status, body);
    return body || {};
  }

  async listVerifiedTotpFactors() {
    const request = mfaAuthRequest.user();
    const user = await this.authenticatedRequest(request.path, { method: request.method });
    this.session.user = user;
    this.setSession(this.session);
    return (user.factors || []).filter((factor) => factor.factor_type === 'totp' && factor.status === 'verified');
  }

  async challengeTotp(factorId) {
    const request = mfaAuthRequest.challenge(factorId);
    const body = await this.authenticatedRequest(request.path, {
      method: request.method,
      body: JSON.stringify(request.body),
    });
    if (!body.id) throw new ApiError('Supabase 未返回 MFA challenge ID');
    return body.id;
  }

  async verifyTotp(factorId, challengeId, code) {
    if (!/^\d{6}$/.test(String(code || ''))) throw new ApiError('请输入验证器中的 6 位验证码');
    const request = mfaAuthRequest.verify({ factorId, challengeId, code });
    const body = await this.authenticatedRequest(request.path, {
      method: request.method,
      body: JSON.stringify(request.body),
    });
    const nextSession = {
      ...this.session,
      ...body,
      user: body.user || this.session.user,
      expires_at: Math.round(Date.now() / 1000) + Number(body.expires_in || 0),
    };
    this.setSession(nextSession);
    if (!this.hasAal2()) throw new ApiError('MFA 验证未将会话升级到 AAL2，请重新登录');
    return nextSession;
  }

  async invokeFunction(functionName, payload, retry = true) {
    if (!this.hasSession()) throw new ApiError('请先登录', 401);
    const response = await fetch(`${this.config.supabaseUrl}/functions/v1/${functionName}`, {
      method: 'POST',
      headers: {
        apikey: this.config.publishableKey,
        Authorization: `Bearer ${this.session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    const body = await parseResponse(response);
    if (response.status === 401 && retry) {
      await this.refresh();
      return this.invokeFunction(functionName, payload, false);
    }
    if (!response.ok) {
      const fallback = response.status === 403 ? '当前账号没有执行此操作的管理员权限' : '后台请求失败';
      throw new ApiError(errorMessage(body, fallback), response.status, body);
    }
    return body || {};
  }

  async registerTerminal() {
    const platformLabel = navigator.userAgentData?.platform || navigator.platform || 'Web';
    return this.invokeFunction('account-sessions', accountSessionsRequest.register({
      installationId: installationId(),
      deviceLabel: `${platformLabel} · DOSO 管理控制台`,
      appVersion: 'admin-1.0.0',
    }));
  }

  async invoke(functionName, payload, retry = true) {
    if (!this.hasSession()) throw new ApiError('请先登录', 401);
    if (!this.hasAal2()) throw new ApiError('管理员操作要求完成 MFA 验证', 403, { code: 'mfa_required' });
    return this.invokeFunction(functionName, payload, retry);
  }
}
