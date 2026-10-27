import { runScenario } from './fixture.mjs';

const args = process.argv.slice(2);
if (args.length > 1 || args[0] && !['all', 'success', 'wrong-password', 'timeout', 'cancel'].includes(args[0])) {
  console.error('Usage: node tools/ble-provisioning-sim/run.mjs [all|success|wrong-password|timeout|cancel]');
  process.exitCode = 2;
} else {
  const names = !args[0] || args[0] === 'all' ? ['success', 'wrong-password', 'timeout', 'cancel'] : [args[0]];
  for (const name of names) console.log(JSON.stringify(await runScenario(name)));
}
