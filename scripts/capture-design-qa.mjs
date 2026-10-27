import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function parseArguments(argv) {
  const options = {
    baseUrl: 'http://127.0.0.1:8085/',
    baseState: 'default',
    chromePath: process.env.DOSO_CHROME_PATH ?? null,
    debug: false,
    debugFilename: null,
    emptySubmit: false,
    outputDirectory: null,
    port: 9300 + (process.pid % 500),
    stage: null,
    states: [],
  };

  for (let index = 2; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--empty-submit') {
      options.emptySubmit = true;
      continue;
    }
    if (argument === '--debug') {
      options.debug = true;
      continue;
    }
    const [name, inlineValue] = argument.split('=', 2);
    if (!name.startsWith('--')) throw new Error(`Unexpected argument: ${argument}`);
    const value = inlineValue ?? argv[++index];
    if (!value) throw new Error(`${name} requires a value`);
    if (name === '--base-url') options.baseUrl = value;
    else if (name === '--base-state') options.baseState = value;
    else if (name === '--chrome') options.chromePath = value;
    else if (name === '--debug-file') options.debugFilename = value;
    else if (name === '--output') options.outputDirectory = value;
    else if (name === '--port') options.port = Number.parseInt(value, 10);
    else if (name === '--stage') options.stage = value;
    else if (name === '--states') options.states = value.split(',').map((item) => item.trim()).filter(Boolean);
    else throw new Error(`Unknown argument: ${name}`);
  }

  if (!options.stage || !/^[a-z0-9-]+$/.test(options.stage)) throw new Error('--stage is required and must be a page ID');
  if (!options.outputDirectory) throw new Error('--output is required');
  if (!Number.isInteger(options.port) || options.port < 1024 || options.port > 65535) throw new Error('--port must be between 1024 and 65535');
  if (options.emptySubmit && options.stage !== 'auth-forgot-password') throw new Error('--empty-submit is only supported for auth-forgot-password');
  return options;
}

function resolveChromePath(explicitPath) {
  const candidates = [
    explicitPath,
    process.platform === 'win32' ? path.join(process.env.PROGRAMFILES ?? '', 'Google', 'Chrome', 'Application', 'chrome.exe') : null,
    process.platform === 'win32' ? path.join(process.env['PROGRAMFILES(X86)'] ?? '', 'Google', 'Chrome', 'Application', 'chrome.exe') : null,
    process.platform === 'win32' ? path.join(process.env.LOCALAPPDATA ?? '', 'Google', 'Chrome', 'Application', 'chrome.exe') : null,
    process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : null,
    process.platform === 'linux' ? '/usr/bin/google-chrome' : null,
    process.platform === 'linux' ? '/usr/bin/chromium' : null,
  ].filter(Boolean);
  const chromePath = candidates.find((candidate) => existsSync(candidate));
  if (!chromePath) throw new Error('Google Chrome was not found; pass --chrome or set DOSO_CHROME_PATH');
  return chromePath;
}

function createCdpSession(webSocketDebuggerUrl) {
  const socket = new WebSocket(webSocketDebuggerUrl);
  let nextId = 1;
  const pending = new Map();

  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data);
    if (!message.id) return;
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error.message));
    else request.resolve(message.result);
  });

  const ready = new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });

  return {
    async command(method, params = {}) {
      await ready;
      const id = nextId++;
      return new Promise((resolve, reject) => {
        pending.set(id, { reject, resolve });
        socket.send(JSON.stringify({ id, method, params }));
      });
    },
    close() {
      socket.close();
    },
  };
}

const options = parseArguments(process.argv);
const chromePath = resolveChromePath(options.chromePath);
const outputDirectory = path.resolve(options.outputDirectory);
const profileDirectory = mkdtempSync(path.join(tmpdir(), 'doso-design-qa-'));
const capturedFiles = [];
mkdirSync(outputDirectory, { recursive: true });

const chrome = spawn(chromePath, [
  '--headless=new',
  '--disable-gpu',
  '--disable-extensions',
  '--hide-scrollbars',
  '--no-first-run',
  '--no-default-browser-check',
  `--remote-debugging-port=${options.port}`,
  '--remote-allow-origins=*',
  `--user-data-dir=${profileDirectory}`,
  'about:blank',
], { stdio: 'ignore', windowsHide: true });
let browserWebSocketDebuggerUrl = null;

async function waitForDebugger() {
  let lastError;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${options.port}/json/version`);
      if (response.ok) {
        const version = await response.json();
        browserWebSocketDebuggerUrl = version.webSocketDebuggerUrl ?? null;
        return;
      }
    } catch (error) {
      lastError = error;
    }
    if (chrome.exitCode !== null) throw new Error(`Chrome exited before debugger startup (code ${chrome.exitCode})`);
    await delay(100);
  }
  throw lastError ?? new Error('Chrome debugger did not start');
}

async function openTarget() {
  const response = await fetch(`http://127.0.0.1:${options.port}/json/new?about:blank`, { method: 'PUT' });
  if (!response.ok) throw new Error(`Unable to create Chrome target: ${response.status}`);
  return response.json();
}

async function closeChrome() {
  if (browserWebSocketDebuggerUrl && chrome.exitCode === null) {
    const browserSession = createCdpSession(browserWebSocketDebuggerUrl);
    try {
      await browserSession.command('Browser.close');
    } catch {
      chrome.kill();
    } finally {
      browserSession.close();
    }
  }
  if (chrome.exitCode !== null) return;
  await Promise.race([
    new Promise((resolve) => chrome.once('exit', resolve)),
    delay(4_000),
  ]);
  if (chrome.exitCode === null) chrome.kill();
}

function pageUrl(state) {
  const url = new URL(options.baseUrl);
  url.searchParams.set('design-qa', '1');
  url.searchParams.set('qa-stage', options.stage);
  url.searchParams.set('qa-state', state);
  return url.toString();
}

async function waitForPage(session) {
  for (let attempt = 0; attempt < 150; attempt += 1) {
    const result = await session.command('Runtime.evaluate', {
      expression: `(() => {
        const text = document.body?.innerText ?? '';
        return {
          invalid: text.includes('设计验收参数无效'),
          ready: document.readyState === 'complete' && Boolean(document.querySelector('[data-testid="design-qa-preview"]')),
        };
      })()`,
      returnByValue: true,
    });
    if (result.result?.value?.invalid) throw new Error(`The design QA harness rejected stage=${options.stage}`);
    if (result.result?.value?.ready) {
      await session.command('Runtime.evaluate', {
        expression: 'document.fonts?.ready ?? Promise.resolve()',
        awaitPromise: true,
      });
      return;
    }
    await delay(100);
  }
  throw new Error('Design QA page did not become ready');
}

async function installCaptureGuards(session) {
  await session.command('Runtime.evaluate', {
    expression: `(() => {
      window.__dosoDesignQaCaptureObserver?.disconnect();
      document.getElementById('doso-design-qa-capture-style')?.remove();
      const style = document.createElement('style');
      style.id = 'doso-design-qa-capture-style';
      style.textContent = '.__expo_fast_refresh { display: none !important; visibility: hidden !important; opacity: 0 !important; }';
      document.documentElement.appendChild(style);
      const hideDevelopmentOverlays = () => {
        for (const element of document.querySelectorAll('.__expo_fast_refresh')) {
          element.style.setProperty('display', 'none', 'important');
          element.style.setProperty('visibility', 'hidden', 'important');
          element.style.setProperty('opacity', '0', 'important');
        }
      };
      const observer = new MutationObserver(hideDevelopmentOverlays);
      observer.observe(document.documentElement, { childList: true, subtree: true });
      window.__dosoDesignQaCaptureObserver = observer;
      hideDevelopmentOverlays();
    })()`,
  });
}

async function removeCaptureGuards(session) {
  await session.command('Runtime.evaluate', {
    expression: `(() => {
      window.__dosoDesignQaCaptureObserver?.disconnect();
      delete window.__dosoDesignQaCaptureObserver;
      document.getElementById('doso-design-qa-capture-style')?.remove();
    })()`,
  }).catch(() => undefined);
}

async function normalizeViewport(session, width, height) {
  const result = await session.command('Runtime.evaluate', {
    expression: `(() => {
      document.querySelector('[data-testid="design-qa-disclosure"]')?.setAttribute('style', 'display:none');
      for (const child of document.body.children) {
        if (child.id !== 'root') child.style.display = 'none';
      }
      for (const element of [document.documentElement, document.body, document.getElementById('root')]) {
        if (!element) continue;
        element.style.width = '${width}px';
        element.style.height = '${height}px';
        element.style.margin = '0';
        element.style.overflow = 'hidden';
        element.scrollTop = 0;
        element.scrollLeft = 0;
      }
      for (const element of document.querySelectorAll('*')) {
        element.style.overflowAnchor = 'none';
        element.scrollTop = 0;
        element.scrollLeft = 0;
      }
      window.scrollTo(0, 0);
      return { height: window.innerHeight, width: window.innerWidth };
    })()`,
    returnByValue: true,
  });
  const viewport = result.result?.value;
  if (viewport?.width !== width || viewport?.height !== height) {
    throw new Error(`Viewport mismatch: expected ${width}x${height}, received ${viewport?.width}x${viewport?.height}`);
  }
}

async function performEmptySubmit(session) {
  const result = await session.command('Runtime.evaluate', {
    expression: `(() => {
      const label = [...document.querySelectorAll('*')]
        .find((element) => element.children.length === 0 && element.textContent?.trim() === '发送验证码');
      const button = label?.closest('[role="button"]') ?? label?.parentElement;
      button?.click();
      return Boolean(button);
    })()`,
    returnByValue: true,
  });
  if (!result.result?.value) throw new Error('Unable to locate the empty-submit action');
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const validation = await session.command('Runtime.evaluate', {
      expression: `(document.body?.innerText ?? '').includes('请输入邮箱地址')`,
      returnByValue: true,
    });
    if (validation.result?.value === true) return;
    await delay(50);
  }
  throw new Error('Empty-submit validation did not render');
}

async function capture({ colorScheme, filename, height, interaction = null, state = 'default', width }) {
  const target = await openTarget();
  const session = createCdpSession(target.webSocketDebuggerUrl);
  try {
    await session.command('Page.enable');
    await session.command('Runtime.enable');
    await session.command('Emulation.setDeviceMetricsOverride', {
      deviceScaleFactor: 1,
      height,
      mobile: false,
      screenHeight: height,
      screenWidth: width,
      width,
    });
    await session.command('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-color-scheme', value: colorScheme }],
    });
    await session.command('Page.navigate', { url: pageUrl(state) });
    await waitForPage(session);
    await installCaptureGuards(session);
    await normalizeViewport(session, width, height);
    if (interaction === 'empty-submit') {
      await performEmptySubmit(session);
      await normalizeViewport(session, width, height);
    }
    await delay(900);
    await normalizeViewport(session, width, height);
    if (options.debug && (!options.debugFilename || options.debugFilename === filename)) {
      const diagnostic = await session.command('Runtime.evaluate', {
        expression: `(() => {
          const chain = [];
          let element = document.elementFromPoint(24, ${height - 24});
          while (element && chain.length < 8) {
            chain.push({
              ariaLabel: element.getAttribute('aria-label'),
              className: String(element.className ?? ''),
              id: element.id,
              outerHTML: element.outerHTML?.slice(0, 700),
              role: element.getAttribute('role'),
              tagName: element.tagName,
            });
            element = element.parentElement;
          }
          const shadowHosts = [...document.querySelectorAll('*')]
            .filter((element) => element.shadowRoot)
            .map((element) => ({
              className: String(element.className ?? ''),
              id: element.id,
              shadowHTML: element.shadowRoot.innerHTML.slice(0, 1200),
              tagName: element.tagName,
            }));
          const fixedElements = [...document.querySelectorAll('*')]
            .map((element) => ({ element, rect: element.getBoundingClientRect(), style: getComputedStyle(element) }))
            .filter(({ rect, style }) => ['fixed', 'sticky'].includes(style.position) && rect.width > 0 && rect.height > 0)
            .map(({ element, rect, style }) => ({
              className: String(element.className ?? ''),
              id: element.id,
              position: style.position,
              rect: { bottom: rect.bottom, height: rect.height, left: rect.left, top: rect.top, width: rect.width },
              tagName: element.tagName,
            }));
          return { chain, fixedElements, shadowHosts };
        })()`,
        returnByValue: true,
      });
      console.error(JSON.stringify({ diagnostic: diagnostic.result?.value, filename }, null, 2));
    }
    const screenshot = await session.command('Page.captureScreenshot', {
      captureBeyondViewport: false,
      clip: { height, scale: 1, width, x: 0, y: 0 },
      format: 'png',
      fromSurface: true,
    });
    writeFileSync(path.join(outputDirectory, filename), Buffer.from(screenshot.data, 'base64'));
    capturedFiles.push(filename);
  } finally {
    await removeCaptureGuards(session);
    session.close();
    await fetch(`http://127.0.0.1:${options.port}/json/close/${target.id}`).catch(() => undefined);
  }
}

try {
  await waitForDebugger();
  await capture({ colorScheme: 'light', filename: 'app-light.png', height: 844, state: options.baseState, width: 390 });
  await capture({ colorScheme: 'dark', filename: 'app-dark.png', height: 844, state: options.baseState, width: 390 });
  await capture({ colorScheme: 'light', filename: 'app-landscape.png', height: 390, state: options.baseState, width: 844 });
  for (const state of [...new Set(options.states)].filter((state) => state !== options.baseState)) {
    await capture({ colorScheme: 'light', filename: `app-${state}.png`, height: 844, state, width: 390 });
  }
  if (options.emptySubmit) {
    await capture({ colorScheme: 'light', filename: 'app-empty-email-error.png', height: 844, interaction: 'empty-submit', width: 390 });
  }
  const files = Object.fromEntries([...new Set(capturedFiles)].sort().map((filename) => {
    const bytes = readFileSync(path.join(outputDirectory, filename));
    return [filename, {
      height: bytes.readUInt32BE(20),
      sha256: createHash('sha256').update(bytes).digest('hex'),
      width: bytes.readUInt32BE(16),
    }];
  }));
  writeFileSync(path.join(outputDirectory, 'app-capture.json'), `${JSON.stringify({
    schemaVersion: 1,
    pageId: options.stage,
    source: 'development-web-design-qa',
    baseState: options.baseState,
    files,
  }, null, 2)}\n`);
  console.log(JSON.stringify({ outputDirectory, stage: options.stage }, null, 2));
} finally {
  await closeChrome();
  try {
    rmSync(profileDirectory, { force: true, maxRetries: 20, recursive: true, retryDelay: 100 });
  } catch (error) {
    console.warn(`Temporary Chrome profile cleanup deferred: ${error instanceof Error ? error.message : String(error)}`);
  }
}
