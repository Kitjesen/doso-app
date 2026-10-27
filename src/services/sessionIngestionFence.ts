import {
  readAuthSessionIdentity,
  type AuthSessionIdentity,
  type PublicAuthSession,
} from './authSessionIdentity';

export type SessionIngestionBlock = 'pending' | 'unknown' | 'revoked';

declare const sessionRevocationTicketBrand: unique symbol;
export type SessionRevocationTicket = Readonly<{
  [sessionRevocationTicketBrand]: true;
}>;

const pendingByIdentity = new Map<string, Set<SessionRevocationTicket>>();
const terminalStateByIdentity = new Map<string, Exclude<SessionIngestionBlock, 'pending'>>();
const ticketIdentity = new WeakMap<SessionRevocationTicket, string>();

function identityKey(identity: AuthSessionIdentity) {
  return `${identity.userId}:${identity.sessionId}`;
}

export function beginSessionRevocation(identity: AuthSessionIdentity): SessionRevocationTicket {
  const key = identityKey(identity);
  const ticket = {} as SessionRevocationTicket;
  const pending = pendingByIdentity.get(key) ?? new Set<SessionRevocationTicket>();
  pending.add(ticket);
  pendingByIdentity.set(key, pending);
  ticketIdentity.set(ticket, key);
  return ticket;
}

function consumeTicket(ticket: SessionRevocationTicket) {
  const key = ticketIdentity.get(ticket);
  if (!key) return null;
  ticketIdentity.delete(ticket);
  const pending = pendingByIdentity.get(key);
  pending?.delete(ticket);
  if (pending?.size === 0) pendingByIdentity.delete(key);
  return key;
}

export function releaseSessionRevocation(ticket: SessionRevocationTicket) {
  consumeTicket(ticket);
}

export function markSessionRevocationUnknown(ticket: SessionRevocationTicket) {
  const key = consumeTicket(ticket);
  if (key && terminalStateByIdentity.get(key) !== 'revoked') terminalStateByIdentity.set(key, 'unknown');
}

export function markSessionRevoked(ticket: SessionRevocationTicket) {
  const key = consumeTicket(ticket);
  if (key) terminalStateByIdentity.set(key, 'revoked');
}

export function getSessionIngestionBlock(session: PublicAuthSession | null): SessionIngestionBlock | null {
  if (session === null) return null;
  const identity = readAuthSessionIdentity(session);
  if (!identity) return 'unknown';
  const key = identityKey(identity);
  return terminalStateByIdentity.get(key) ?? (pendingByIdentity.has(key) ? 'pending' : null);
}
