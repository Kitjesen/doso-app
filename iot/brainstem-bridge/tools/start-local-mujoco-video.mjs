import { execFileSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const PYTHON_CANDIDATES = [
  'D:\\inovxio\\brain\\lingtu\\.venv-mujoco4\\Scripts\\python.exe',
  'D:\\inovxio\\brain\\lingtu\\.venv-mj4\\Scripts\\python.exe',
  'C:\\Users\\99563\\miniconda3\\python.exe',
  'D:\\inovxio\\brain\\lingtu\\.venv\\Scripts\\python.exe',
];

function hasMujocoDeps(executable) {
  try {
    execFileSync(executable, ['-c', 'import mujoco, cv2, numpy'], {
      stdio: 'ignore',
      timeout: 5000,
    });
    return true;
  } catch {
    return false;
  }
}

function resolvePythonExecutable() {
  const configured = (process.env.DOSO_MUJOCO_PYTHON || process.env.DOSO_PYTHON || '').trim();
  if (configured) return configured;
  if (process.platform === 'win32') {
    for (const candidate of PYTHON_CANDIDATES) {
      if (existsSync(candidate) && hasMujocoDeps(candidate)) {
        return candidate;
      }
    }
  }
  return 'python';
}

function main() {
  const python = resolvePythonExecutable();
  const scriptPath = path.resolve(import.meta.dirname, 'local_mujoco_video_sim.py');
  const child = spawn(python, [scriptPath, ...process.argv.slice(2)], {
    stdio: ['ignore', 'inherit', 'inherit'],
  });

  const forwardSignal = (signal) => {
    if (!child.killed) {
      child.kill(signal);
    }
  };
  process.once('SIGINT', () => forwardSignal('SIGINT'));
  process.once('SIGTERM', () => forwardSignal('SIGTERM'));

  child.once('error', (error) => {
    console.error(JSON.stringify({
      event: 'error',
      service: 'local-mujoco-video-sim',
      message: error instanceof Error ? error.message : String(error),
    }));
    process.exit(1);
  });

  child.once('exit', (code, signal) => {
    if (signal) process.exit(1);
    process.exit(code ?? 0);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main();
}
