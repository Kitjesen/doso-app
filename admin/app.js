import { ApiError, DosoAdminApi } from './api.js';
import {
  adminDevicesRequest,
  adminUsersRequest,
  normalizeAuditLog,
  normalizeIdentity,
  normalizeTerminal,
  normalizeUser,
  pageFrom,
} from './contracts.js';

const api = new DosoAdminApi();
const state = {
  users: { page: 1, pageSize: 20, total: 0, query: '' },
  devices: { page: 1, pageSize: 20, total: 0 },
  audit: { page: 1, pageSize: 30, total: 0 },
  pendingAction: null,
  pendingAfterAction: null,
  canManageRoles: false,
};

const $ = (id) => document.getElementById(id);
const els = Object.fromEntries([
  'loginView','appView','nav','loginForm','supabaseUrl','publishableKey','email','password','loginError','operatorEmail','logoutButton','pageTitle','globalAlert','loading',
  'mfaView','mfaForm','mfaDescription','mfaFactorLabel','mfaFactor','mfaCodeLabel','mfaCode','mfaError','mfaSubmit','mfaLogout','mfaBlocked','mfaBlockedTitle','mfaBlockedText','mfaBlockedLogout',
  'usersPanel','userSearchForm','userSearch','refreshUsers','usersBody','usersEmpty','usersPrev','usersNext','usersPage',
  'devicesPanel','refreshDevices','addDevice','devicesBody','devicesEmpty','devicesPrev','devicesNext','devicesPage',
  'auditPanel','refreshAudit','auditBody','auditEmpty','auditPrev','auditNext','auditPage',
  'actionDialog','actionForm','actionTitle','actionDescription','actionRoleLabel','actionRole','reasonLabel','actionReason','actionError','actionCancel','actionConfirm',
  'deviceDialog','deviceForm','deviceModel','deviceName','deviceSerial','deviceCategory','deviceEnvironment','deviceError','deviceCancel',
  'codeDialog','bindingCode','copyCode','closeCode',
  'terminalsDialog','terminalsUser','terminalsBody','terminalsEmpty','terminalsClose',
  'identitiesDialog','identitiesUser','identitiesBody','identitiesEmpty','identitiesClose',
].map((id) => [id, $(id)]));

function setLoading(value) { els.loading.hidden = !value; }
function showAlert(message, kind = 'success') {
  els.globalAlert.textContent = message;
  els.globalAlert.className = kind === 'error' ? 'alert error' : 'alert';
  els.globalAlert.hidden = false;
  window.clearTimeout(showAlert.timer);
  showAlert.timer = window.setTimeout(() => { els.globalAlert.hidden = true; }, 6000);
}
function showFieldError(element, error) {
  element.textContent = error instanceof ApiError ? error.message : '操作失败，请稍后重试';
  element.hidden = false;
}
function text(value, fallback = '—') { return value === null || value === undefined || value === '' ? fallback : String(value); }
function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? text(value) : new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}
function cell(row, value, className) {
  const td = document.createElement('td');
  if (className) td.className = className;
  if (value instanceof Node) td.append(value); else td.textContent = text(value);
  row.append(td);
  return td;
}
function detail(primary, secondary) {
  const box = document.createElement('div');
  const strong = document.createElement('strong'); strong.textContent = text(primary);
  const small = document.createElement('small'); small.textContent = text(secondary);
  box.append(strong, small); return box;
}
function badge(label, kind = '') {
  const span = document.createElement('span'); span.className = `badge ${kind}`.trim(); span.textContent = text(label); return span;
}
function button(label, action, item, dangerous = false) {
  const btn = document.createElement('button'); btn.type = 'button'; btn.className = `button small${dangerous ? ' danger-ghost' : ''}`; btn.textContent = label;
  btn.addEventListener('click', () => action(item)); return btn;
}
function showLogin() {
  els.appView.hidden = true; els.mfaView.hidden = true; els.nav.hidden = true; els.loginView.hidden = false;
  els.password.value = '';
  els.supabaseUrl.value = api.config.supabaseUrl || '';
  els.publishableKey.value = api.config.publishableKey || '';
}
function showMfa(factors) {
  els.loginView.hidden = true; els.appView.hidden = true; els.nav.hidden = true; els.mfaView.hidden = false;
  els.mfaError.hidden = true; els.mfaCode.value = '';
  els.mfaFactor.replaceChildren();
  for (const factor of factors) {
    const option = document.createElement('option');
    option.value = factor.id; option.textContent = factor.friendly_name || `TOTP · ${String(factor.id).slice(0, 8)}`;
    els.mfaFactor.append(option);
  }
  const blocked = factors.length === 0;
  els.mfaBlockedTitle.textContent = '此管理员账号尚未注册可用的 TOTP 因子';
  els.mfaBlockedText.textContent = '为避免在管理终端暴露 MFA secret，本控制台不提供注册二维码或密钥。请先在受信任的账号安全流程中完成 TOTP 注册和首次验证，然后重新登录。';
  els.mfaBlocked.hidden = !blocked; els.mfaForm.hidden = blocked;
}
async function beginAuthenticatedFlow() {
  setLoading(true);
  try {
    await api.registerTerminal();
    const factors = await api.listVerifiedTotpFactors();
    if (api.hasAal2()) await showApp(); else showMfa(factors);
  }
  catch (error) {
    if (error?.status === 401) { api.clearSession(); showLogin(); showFieldError(els.loginError, error); }
    else {
      showMfa([]);
      els.mfaBlockedTitle.textContent = '暂时无法验证管理员 MFA 状态';
      els.mfaBlockedText.textContent = error instanceof ApiError ? error.message : '无法连接 Supabase Auth，请检查网络后重新登录。';
    }
  } finally { setLoading(false); }
}
async function showApp() {
  if (!api.hasAal2()) throw new ApiError('管理员操作要求完成 MFA 验证', 403, { code: 'mfa_required' });
  els.loginView.hidden = true; els.mfaView.hidden = true; els.appView.hidden = false; els.nav.hidden = false;
  els.operatorEmail.textContent = api.getUser()?.email || '管理员';
  state.canManageRoles = await detectRoleManagementPermission();
  await loadUsers();
}
async function detectRoleManagementPermission() {
  try {
    await api.invoke('admin-devices', adminDevicesRequest.listDevices({ page: 1, perPage: 1 }));
    return true;
  } catch (error) {
    const code = error?.details?.error?.code || error?.details?.code;
    if (error?.status === 403 && ['forbidden', 'admin_required'].includes(code)) return false;
    throw error;
  }
}
function handleApiError(error) {
  if (error?.status === 401) { api.clearSession(); showLogin(); showFieldError(els.loginError, error); return; }
  if (error?.details?.code === 'mfa_required' || error?.details?.error?.code === 'mfa_required') { beginAuthenticatedFlow(); return; }
  showAlert(error instanceof ApiError ? error.message : '后台请求失败，请稍后重试', 'error');
}
async function refreshCurrentView() {
  if (!els.usersPanel.hidden) await loadUsers();
  else if (!els.devicesPanel.hidden) await loadDevices();
  else await loadAudit();
}

async function loadUsers() {
  setLoading(true);
  try {
    const result = await api.invoke('admin-users', adminUsersRequest.listUsers({ page: state.users.page, perPage: state.users.pageSize, search: state.users.query }));
    const page = pageFrom(result, 'users'); state.users.total = page.total; renderUsers(page.rows.map(normalizeUser));
  } catch (error) { handleApiError(error); } finally { setLoading(false); }
}
function renderUsers(users) {
  els.usersBody.replaceChildren(); els.usersEmpty.hidden = users.length > 0;
  for (const user of users) {
    const row = document.createElement('tr');
    cell(row, detail(user.username || '未设置用户名', user.email));
    cell(row, badge(user.role, /admin/i.test(user.role) ? 'warning' : ''));
    const status = user.status;
    cell(row, badge(status, status === 'active' ? 'success' : 'danger'));
    cell(row, formatDate(user.createdAt)); cell(row, formatDate(user.lastSignInAt));
    const actions = document.createElement('div');
    actions.append(
      button('查看终端', showUserTerminals, user),
      button('登录方式', showUserIdentities, user),
      button(status === 'active' ? '暂停' : '恢复', (item) => confirmUserStatus(item, status !== 'active'), user, status === 'active'),
      button('重置密码', confirmPasswordReset, user),
      button('注销全部终端', confirmGlobalSignout, user, true),
    );
    if (state.canManageRoles) {
      const roleButton = button('修改角色', confirmSetRole, user, true);
      if (user.id === api.getUser()?.id) {
        roleButton.disabled = true;
        roleButton.title = '不能修改当前登录管理员自己的角色';
      }
      actions.append(roleButton);
    }
    cell(row, actions); els.usersBody.append(row);
  }
  const pages = Math.max(1, Math.ceil(state.users.total / state.users.pageSize));
  els.usersPage.textContent = `第 ${state.users.page} / ${pages} 页 · ${state.users.total} 个账号`;
  els.usersPrev.disabled = state.users.page <= 1; els.usersNext.disabled = state.users.page >= pages;
}

function identityProviderLabel(providerKey) {
  const labels = {
    apple: 'Apple',
    wechat: '微信',
    qq: 'QQ',
    email: '邮箱密码',
    phone: '手机号',
  };
  return labels[String(providerKey || '').toLowerCase()] || '其他登录方式';
}

async function showUserIdentities(user) {
  setLoading(true);
  try {
    const result = await api.invoke('admin-users', adminUsersRequest.listUserIdentities({ userId: user.id }));
    const identities = Array.isArray(result?.identities) ? result.identities.map(normalizeIdentity) : [];
    els.identitiesUser.textContent = `${user.username || '未设置用户名'} · ${user.email}`;
    els.identitiesBody.replaceChildren();
    els.identitiesEmpty.hidden = identities.length > 0;
    for (const identity of identities) {
      const row = document.createElement('tr');
      const providerKind = identity.kind || identity.providerKey;
      const isSocial = ['apple', 'wechat', 'qq'].includes(String(identity.kind).toLowerCase());
      cell(row, detail(identityProviderLabel(providerKind), isSocial ? '第三方登录' : '账号凭据'));
      cell(row, badge(identity.status === 'unlinked' || identity.unlinkedAt ? '已解绑' : '有效', identity.status === 'unlinked' || identity.unlinkedAt ? 'danger' : 'success'));
      cell(row, badge(identity.emailVerified ? '已验证' : '未验证', identity.emailVerified ? 'success' : 'warning'));
      cell(row, formatDate(identity.linkedAt));
      cell(row, formatDate(identity.lastSignInAt));
      els.identitiesBody.append(row);
    }
    if (!els.identitiesDialog.open) els.identitiesDialog.showModal();
  } catch (error) {
    handleApiError(error);
  } finally {
    setLoading(false);
  }
}

async function showUserTerminals(user) {
  setLoading(true);
  try {
    const result = await api.invoke('admin-users', adminUsersRequest.listUserTerminals({ userId: user.id }));
    const terminals = Array.isArray(result?.terminals) ? result.terminals.map(normalizeTerminal) : [];
    els.terminalsUser.textContent = `${user.username || '未设置用户名'} · ${user.email}`;
    els.terminalsBody.replaceChildren();
    els.terminalsEmpty.hidden = terminals.length > 0;
    for (const terminal of terminals) {
      const row = document.createElement('tr');
      cell(row, detail(terminal.deviceLabel, terminal.id));
      cell(row, terminal.platform);
      const statuses = document.createElement('div');
      statuses.append(badge(terminal.revokedAt ? '已撤销' : '活跃', terminal.revokedAt ? 'danger' : 'success'));
      if (terminal.isCurrent) statuses.append(badge('当前', 'warning'));
      cell(row, statuses);
      cell(row, formatDate(terminal.lastSeenAt));
      cell(row, formatDate(terminal.createdAt));
      const actions = document.createElement('div');
      if (!terminal.revokedAt) actions.append(button('撤销终端', () => confirmRevokeTerminal(user, terminal), terminal, true));
      else actions.append(document.createTextNode(`撤销于 ${formatDate(terminal.revokedAt)}`));
      cell(row, actions);
      els.terminalsBody.append(row);
    }
    if (!els.terminalsDialog.open) els.terminalsDialog.showModal();
  } catch (error) {
    handleApiError(error);
  } finally {
    setLoading(false);
  }
}

async function loadDevices() {
  setLoading(true);
  try {
    const result = await api.invoke('admin-devices', adminDevicesRequest.listDevices({ page: state.devices.page, perPage: state.devices.pageSize }));
    const page = pageFrom(result, 'devices'); state.devices.total = page.total; renderDevices(page.rows);
  } catch (error) { handleApiError(error); } finally { setLoading(false); }
}
function renderDevices(devices) {
  els.devicesBody.replaceChildren(); els.devicesEmpty.hidden = devices.length > 0;
  for (const device of devices) {
    const row = document.createElement('tr');
    cell(row, detail(device.display_name || device.name, device.model_code || device.model)); cell(row, device.serial_number);
    cell(row, detail(device.owner_email, device.owner_id));
    cell(row, badge(device.connection_status || 'offline', device.connection_status === 'online' ? 'success' : ''));
    cell(row, badge(device.owner_id ? '已绑定' : '未绑定', device.owner_id ? 'success' : 'warning'));
    cell(row, formatDate(device.last_seen_at || device.last_seen));
    const actions = document.createElement('div');
    actions.append(button('生成 / 轮换绑定码', confirmRotateCode, device, true));
    if (device.owner_id) actions.append(button('解除绑定', confirmUnbind, device, true));
    cell(row, actions); els.devicesBody.append(row);
  }
  const pages = Math.max(1, Math.ceil(state.devices.total / state.devices.pageSize));
  els.devicesPage.textContent = `第 ${state.devices.page} / ${pages} 页 · ${state.devices.total} 台设备`;
  els.devicesPrev.disabled = state.devices.page <= 1; els.devicesNext.disabled = state.devices.page >= pages;
}

async function loadAudit() {
  setLoading(true);
  try {
    const result = await api.invoke('admin-users', adminUsersRequest.listAuditLogs({ page: state.audit.page, perPage: state.audit.pageSize }));
    const page = pageFrom(result, 'auditLogs'); state.audit.total = page.total; renderAudit(page.rows.map(normalizeAuditLog));
  } catch (error) { handleApiError(error); } finally { setLoading(false); }
}
function renderAudit(logs) {
  els.auditBody.replaceChildren(); els.auditEmpty.hidden = logs.length > 0;
  for (const log of logs) {
    const row = document.createElement('tr'); cell(row, formatDate(log.createdAt)); cell(row, log.actorId);
    cell(row, log.action); cell(row, detail(log.targetType, log.targetId)); cell(row, log.reason);
    cell(row, badge(log.status || 'success', log.status === 'failed' ? 'danger' : 'success')); els.auditBody.append(row);
  }
  const pages = Math.max(1, Math.ceil(state.audit.total / state.audit.pageSize));
  els.auditPage.textContent = `第 ${state.audit.page} / ${pages} 页 · ${state.audit.total} 条记录`;
  els.auditPrev.disabled = state.audit.page <= 1; els.auditNext.disabled = state.audit.page >= pages;
}

function openAction({ title, description, confirmLabel = '确认执行', dangerous = true, requireReason = true, role = null, run, afterSuccess = null }) {
  state.pendingAction = run; state.pendingAfterAction = afterSuccess; els.actionTitle.textContent = title; els.actionDescription.textContent = description;
  els.actionConfirm.textContent = confirmLabel; els.actionConfirm.className = `button ${dangerous ? 'danger' : 'primary'}`;
  els.actionRoleLabel.hidden = role === null; els.actionRole.required = role !== null;
  if (role !== null) els.actionRole.value = role;
  els.reasonLabel.hidden = !requireReason; els.actionReason.required = requireReason; els.actionReason.value = ''; els.actionError.hidden = true;
  els.actionDialog.showModal();
}
function confirmRevokeTerminal(user, terminal) {
  els.terminalsDialog.close();
  openAction({
    title: '撤销单个终端',
    description: `撤销 ${user.email} 的终端“${terminal.deviceLabel || terminal.id}”。该终端将立即失去 DOSO 数据访问权限，其他终端不受影响。`,
    run: (reason) => api.invoke('admin-users', adminUsersRequest.revokeUserTerminal({ userId: user.id, terminalId: terminal.id, reason })),
    afterSuccess: () => showUserTerminals(user),
  });
}
function confirmUserStatus(user, activate) {
  openAction({ title: activate ? '恢复账号' : '暂停账号', description: `${activate ? '恢复' : '暂停'} ${user.email}。${activate ? '用户将重新获得登录权限。' : '用户将无法继续登录，现有终端也应由后端撤销。'}`, dangerous: !activate,
    run: (reason) => api.invoke('admin-users', adminUsersRequest.setStatus({ userId: user.id, status: activate ? 'active' : 'suspended', reason })) });
}
function confirmPasswordReset(user) {
  openAction({ title: '发送密码重置邮件', description: `向 ${user.email} 发送密码重置邮件。管理员无法查看或设置用户原密码。`, confirmLabel: '发送邮件', dangerous: false,
    run: (reason) => api.invoke('admin-users', adminUsersRequest.sendPasswordReset({ userId: user.id, reason })) });
}
function confirmGlobalSignout(user) {
  openAction({ title: '注销全部终端', description: `撤销 ${user.email} 已登记的全部 DOSO 应用终端会话。用户需要在所有设备上重新登录 DOSO。`,
    run: (reason) => api.invoke('admin-users', adminUsersRequest.globalSignout({ userId: user.id, reason })) });
}
function confirmSetRole(user) {
  if (!state.canManageRoles) { showAlert('当前账号没有修改角色的管理员权限', 'error'); return; }
  if (user.id === api.getUser()?.id) { showAlert('不能修改当前登录管理员自己的角色', 'error'); return; }
  openAction({
    title: '修改账号角色',
    description: `即将修改 ${user.email} 的后台权限。提升为 admin 会授予高风险管理能力，降级会立即移除对应权限。`,
    confirmLabel: '确认修改角色',
    role: user.role,
    run: (reason, role) => api.invoke('admin-users', adminUsersRequest.setRole({ userId: user.id, role, reason })),
  });
}
function confirmRotateCode(device) {
  openAction({ title: '生成 / 轮换设备绑定码', description: `为 ${device.display_name || device.serial_number} 生成新绑定码。旧码将立即失效。`,
    run: async () => { const result = await api.invoke('admin-devices', adminDevicesRequest.rotateBindingCode({ deviceId: device.id })); showBindingCode(result.bindingCode); } });
}
function confirmUnbind(device) {
  openAction({ title: '解除设备绑定', description: `解除 ${device.display_name || device.serial_number} 与当前用户的绑定。设备控制权限将立即移除。`,
    run: (reason) => api.invoke('admin-devices', adminDevicesRequest.unbind({ deviceId: device.id, reason })) });
}
function showBindingCode(code) {
  if (!code) { showAlert('操作成功，但后端未返回明文绑定码', 'error'); return; }
  els.bindingCode.textContent = code; els.codeDialog.showModal();
}

els.loginForm.addEventListener('submit', async (event) => {
  event.preventDefault(); els.loginError.hidden = true; setLoading(true);
  try { api.saveConfig(els.supabaseUrl.value, els.publishableKey.value); await api.login(els.email.value, els.password.value); els.password.value = ''; await beginAuthenticatedFlow(); }
  catch (error) { showFieldError(els.loginError, error); } finally { setLoading(false); }
});
els.mfaForm.addEventListener('submit', async (event) => {
  event.preventDefault(); els.mfaError.hidden = true; els.mfaSubmit.disabled = true;
  try {
    const factorId = els.mfaFactor.value;
    if (!factorId) throw new ApiError('请选择已注册的 TOTP 验证器');
    const challengeId = await api.challengeTotp(factorId);
    await api.verifyTotp(factorId, challengeId, els.mfaCode.value.trim());
    await api.registerTerminal();
    els.mfaCode.value = '';
    await showApp();
  } catch (error) {
    if (error?.status === 401) { api.clearSession(); showLogin(); showFieldError(els.loginError, error); }
    else showFieldError(els.mfaError, error);
  }
  finally { els.mfaSubmit.disabled = false; }
});
async function logoutFromMfa() { setLoading(true); try { await api.logout(); } finally { setLoading(false); showLogin(); } }
els.mfaLogout.addEventListener('click', logoutFromMfa);
els.mfaBlockedLogout.addEventListener('click', logoutFromMfa);
els.logoutButton.addEventListener('click', async () => { setLoading(true); try { await api.logout(); } finally { setLoading(false); showLogin(); } });
document.querySelectorAll('.nav-item').forEach((item) => item.addEventListener('click', async () => {
  document.querySelectorAll('.nav-item').forEach((node) => node.classList.toggle('active', node === item));
  const view = item.dataset.view; const titles = { users: '账号管理', devices: '设备管理', audit: '审计日志' };
  els.pageTitle.textContent = titles[view]; ['users','devices','audit'].forEach((name) => { $(`${name}Panel`).hidden = name !== view; });
  if (view === 'users') await loadUsers(); else if (view === 'devices') await loadDevices(); else await loadAudit();
}));
els.userSearchForm.addEventListener('submit', (event) => { event.preventDefault(); state.users.query = els.userSearch.value.trim(); state.users.page = 1; loadUsers(); });
els.refreshUsers.addEventListener('click', loadUsers); els.refreshDevices.addEventListener('click', loadDevices); els.refreshAudit.addEventListener('click', loadAudit);
els.usersPrev.addEventListener('click', () => { state.users.page -= 1; loadUsers(); }); els.usersNext.addEventListener('click', () => { state.users.page += 1; loadUsers(); });
els.devicesPrev.addEventListener('click', () => { state.devices.page -= 1; loadDevices(); }); els.devicesNext.addEventListener('click', () => { state.devices.page += 1; loadDevices(); });
els.auditPrev.addEventListener('click', () => { state.audit.page -= 1; loadAudit(); }); els.auditNext.addEventListener('click', () => { state.audit.page += 1; loadAudit(); });
els.actionCancel.addEventListener('click', () => { state.pendingAction = null; state.pendingAfterAction = null; els.actionDialog.close(); });
els.actionForm.addEventListener('submit', async (event) => {
  event.preventDefault(); if (!state.pendingAction) return; els.actionError.hidden = true; els.actionConfirm.disabled = true;
  try {
    await state.pendingAction(els.actionReason.value.trim(), els.actionRole.value);
    const afterSuccess = state.pendingAfterAction;
    state.pendingAction = null;
    state.pendingAfterAction = null;
    els.actionDialog.close();
    showAlert('操作已完成并写入审计日志');
    if (afterSuccess) await afterSuccess(); else await refreshCurrentView();
  } catch (error) {
    const code = error?.details?.error?.code || error?.details?.code;
    showFieldError(els.actionError, error?.status === 409 && code === 'self_management_blocked'
      ? new ApiError('安全限制：不能修改当前登录管理员自己的角色或状态。请由另一位管理员操作。', 409)
      : error);
  } finally {
    els.actionConfirm.disabled = false;
  }
});
els.addDevice.addEventListener('click', () => { els.deviceForm.reset(); els.deviceError.hidden = true; els.deviceDialog.showModal(); });
els.deviceCancel.addEventListener('click', () => els.deviceDialog.close());
els.deviceForm.addEventListener('submit', async (event) => {
  event.preventDefault(); els.deviceError.hidden = true; setLoading(true);
  try {
    const created = await api.invoke('admin-devices', adminDevicesRequest.createInventory({
      modelCode: els.deviceModel.value.trim(), displayName: els.deviceName.value.trim(), serialNumber: els.deviceSerial.value.trim(),
      category: els.deviceCategory.value, environment: els.deviceEnvironment.value,
    }));
    const rotated = await api.invoke('admin-devices', adminDevicesRequest.rotateBindingCode({ deviceId: created.device.id }));
    els.deviceDialog.close(); showBindingCode(rotated.bindingCode); await loadDevices();
  } catch (error) { showFieldError(els.deviceError, error); } finally { setLoading(false); }
});
els.copyCode.addEventListener('click', async () => { await navigator.clipboard.writeText(els.bindingCode.textContent); els.copyCode.textContent = '已复制'; });
els.closeCode.addEventListener('click', () => { els.bindingCode.textContent = ''; els.copyCode.textContent = '复制'; els.codeDialog.close(); });
els.terminalsClose.addEventListener('click', () => els.terminalsDialog.close());
els.identitiesClose.addEventListener('click', () => els.identitiesDialog.close());

if (api.hasSession()) beginAuthenticatedFlow().catch(handleApiError); else showLogin();
