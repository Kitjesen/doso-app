export type SessionPreparationTicket = {
  generation: number;
  userId: string | null;
};

export function createSessionPreparationTracker() {
  let generation = 0;
  let currentUserId: string | null = null;
  return {
    begin(userId: string | null): SessionPreparationTicket {
      currentUserId = userId;
      generation += 1;
      return { generation, userId };
    },
    isCurrent(ticket: SessionPreparationTicket) {
      return ticket.generation === generation && ticket.userId === currentUserId;
    },
    getCurrentUserId() {
      return currentUserId;
    },
    getCurrentTicket(): SessionPreparationTicket {
      return { generation, userId: currentUserId };
    },
  };
}

export function getPreparedSessionKey(ticket: SessionPreparationTicket) {
  return ticket.userId ? `${ticket.userId}:${ticket.generation}` : null;
}

export function canHeartbeatPreparedSession(
  sessionUserId: string | null | undefined,
  preparedUserId: string | null | undefined,
) {
  return Boolean(sessionUserId && preparedUserId === sessionUserId);
}
