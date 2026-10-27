import { WebSocket, WebSocketServer } from 'ws';

const STREAM_PATH = /^\/api\/v1\/simulation\/sessions\/([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\/stream$/iu;
const MAX_PAYLOAD = 16 * 1024;

function rejectUpgrade(socket, statusCode, reason) {
  if (socket.destroyed) return;
  const body = Buffer.from(JSON.stringify({ error: { message: reason } }));
  socket.end([
    `HTTP/1.1 ${statusCode} ${statusCode === 403 ? 'Forbidden' : statusCode === 404 ? 'Not Found' : 'Conflict'}`,
    'Connection: close',
    'Content-Type: application/json; charset=utf-8',
    `Content-Length: ${body.length}`,
    '',
    body.toString('utf8'),
  ].join('\r\n'));
}

function sendJson(socket, body, callback) {
  if (socket.readyState !== WebSocket.OPEN) {
    callback?.(new Error('simulation stream is not open'));
    return;
  }
  socket.send(JSON.stringify(body), callback);
}

function parseTextMessage(data) {
  let body;
  try {
    body = JSON.parse(data.toString('utf8'));
  } catch {
    throw Object.assign(new Error('stream message must be valid JSON'), { closeCode: 1008 });
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw Object.assign(new Error('stream message must be a JSON object'), { closeCode: 1008 });
  }
  return body;
}

export function attachSimulationStreamServer({
  server,
  allowedHost,
  allowedOrigin,
  getSession,
  setInput,
  stopAndRelease,
}) {
  const webSocketServer = new WebSocketServer({
    noServer: true,
    clientTracking: true,
    maxPayload: MAX_PAYLOAD,
    perMessageDeflate: false,
  });

  const failClosed = (socket, session, reason, closeCode = 1008) => {
    if (!session.streamFailure) {
      session.streamFailure = stopAndRelease(session, reason).catch(() => {});
    }
    if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
      socket.close(closeCode, 'simulation stream closed');
    }
  };

  webSocketServer.on('connection', (socket, request, session) => {
    session.streamSocket = socket;
    session.closeStream = () => {
      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
        socket.close(1000, 'session stopped');
      }
    };
    sendJson(socket, {
      kind: 'stream-ready',
      schemaVersion: 1,
      simulationOnly: true,
      sessionId: session.id,
    });

    socket.on('message', async (data, isBinary) => {
      if (isBinary) {
        failClosed(socket, session, 'binary-stream-message');
        return;
      }

      let body;
      try {
        body = parseTextMessage(data);
      } catch (error) {
        failClosed(socket, session, 'invalid-stream-message', error.closeCode);
        return;
      }

      if (body.kind === 'release') {
        if (session.streamReleaseRequested) return;
        session.streamReleaseRequested = true;
        try {
          await stopAndRelease(session, 'stream-release');
          sendJson(socket, {
            kind: 'release-ack',
            schemaVersion: 1,
            simulationOnly: true,
            released: true,
            zeroAcknowledged: true,
            sessionId: session.id,
          }, () => socket.close(1000, 'released'));
        } catch {
          failClosed(socket, session, 'stream-release-error', 1011);
        }
        return;
      }

      if (body.kind !== 'input' || session.streamReleaseRequested || session.stopping) {
        failClosed(socket, session, 'invalid-stream-message');
        return;
      }
      if (session.streamInputPending) {
        failClosed(socket, session, 'concurrent-stream-input');
        return;
      }

      session.streamInputPending = true;
      try {
        const ack = await setInput(session, body.inputSequence, body.velocity);
        sendJson(socket, {
          kind: 'input-ack',
          schemaVersion: 1,
          simulationOnly: true,
          sessionId: session.id,
          inputSequence: body.inputSequence,
          accepted: true,
          gRpcSequence: Number(ack.sequence),
          status: 'accepted',
        });
      } catch (error) {
        if (!session.streamReleaseRequested) {
          failClosed(socket, session, 'stream-input-error', error?.statusCode && error.statusCode < 500 ? 1008 : 1011);
        }
      } finally {
        session.streamInputPending = false;
      }
    });

    socket.on('error', () => failClosed(socket, session, 'stream-error', 1011));
    socket.on('close', () => {
      session.streamSocket = null;
      session.closeStream = null;
      void stopAndRelease(session, session.streamReleaseRequested ? 'stream-release' : 'stream-close').catch(() => {});
    });
  });

  webSocketServer.on('wsClientError', (_error, socket, request) => {
    const url = new URL(request.url, 'http://gateway.invalid');
    const match = STREAM_PATH.exec(url.pathname);
    const session = match ? getSession(match[1]) : undefined;
    if (session?.transport === 'stream') void stopAndRelease(session, 'stream-handshake-error').catch(() => {});
    socket.destroy();
  });

  const onUpgrade = (request, socket, head) => {
    let claimedSession;
    try {
      if (request.method !== 'GET' || !allowedHost(request) || !allowedOrigin(request)) {
        rejectUpgrade(socket, 403, 'stream upgrade is not allowed');
        return;
      }
      const url = new URL(request.url, 'http://gateway.invalid');
      const match = !url.search && STREAM_PATH.exec(url.pathname);
      if (!match) {
        rejectUpgrade(socket, 404, 'stream route was not found');
        return;
      }
      const session = getSession(match[1]);
      if (!session || session.stopping) {
        rejectUpgrade(socket, 404, 'simulation session was not found');
        return;
      }
      if (session.transport !== undefined || session.streamSocket) {
        void stopAndRelease(session, 'mixed-or-duplicate-stream').catch(() => {});
        rejectUpgrade(socket, 409, 'simulation session already has an input transport');
        return;
      }
      session.transport = 'stream';
      claimedSession = session;
      webSocketServer.handleUpgrade(request, socket, head, (webSocket) => {
        webSocketServer.emit('connection', webSocket, request, session);
      });
    } catch {
      if (claimedSession) void stopAndRelease(claimedSession, 'stream-handshake-error').catch(() => {});
      rejectUpgrade(socket, 403, 'stream upgrade is not allowed');
    }
  };

  server.on('upgrade', onUpgrade);

  const close = async () => {
    server.off('upgrade', onUpgrade);
    for (const socket of webSocketServer.clients) socket.terminate();
    await new Promise((resolve) => webSocketServer.close(() => resolve()));
  };

  return Object.freeze({ close, maxPayload: MAX_PAYLOAD });
}
