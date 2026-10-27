import { existsSync } from 'node:fs';
import { loadConfig } from '../src/config.js';
import { summarizeConfig } from '../src/configReport.js';

try {
  const config = loadConfig();
  const report = summarizeConfig(config, existsSync);
  process.stdout.write(`${JSON.stringify(report)}\n`);
  if (!report.ok) process.exitCode = 2;
} catch {
  // Do not echo environment values or filesystem paths into CI/logs.
  process.stdout.write(`${JSON.stringify({ ok: false, reason: 'configuration_invalid' })}\n`);
  process.exitCode = 2;
}
