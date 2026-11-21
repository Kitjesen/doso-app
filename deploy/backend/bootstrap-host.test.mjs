import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, mkdir, symlink, writeFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const file = fileURLToPath(new URL('./bootstrap-host.sh', import.meta.url));
const script = await readFile(file, 'utf8');
const bash = process.platform === 'win32' ? 'D:/Program Files/Git/bin/bash.exe' : '/bin/bash';
const environment = { ...process.env };
delete environment.BASH_ENV;
delete environment.ENV;
const run = (args) => spawnSync(bash, ['--noprofile', '--norc', ...args], { encoding: 'utf8', env: environment, timeout: 10000 });
const shell = run(['--version']);
const parser = script.split('# BEGIN APT PLAN VALIDATOR')[1].split('\n').slice(1).join('\n').split('# END APT PLAN VALIDATOR')[0];
const basePlan = 'Inst docker.io (28.2.2-0ubuntu1~22.04.1 Ubuntu:22.04/jammy-updates [amd64])\nInst docker-compose-v2 (2.37.1-0ubuntu1~22.04.1 Ubuntu:22.04/jammy-updates [amd64])\n';

test('script passes Bash syntax validation without executing installation', (t) => {
  if (shell.error) return t.skip('Bash is not available; no shell syntax/runtime claim');
  const result = run(['-n', file.replaceAll('\\', '/')]);
  assert.equal(result.status, 0, result.stderr);
});

test('pure apt plan parser accepts only new Ubuntu Docker dependencies', async (t) => {
  if (shell.error) return t.skip('Bash is not available; parser fixtures not executed');
  const directory = await mkdtemp(path.join(os.tmpdir(), 'doso-bootstrap-parser-'));
  t.after(async () => {
    assert.equal(path.dirname(directory), path.resolve(os.tmpdir()));
    assert.ok(path.basename(directory).startsWith('doso-bootstrap-parser-'));
    await rm(directory, { recursive: true, force: true });
  });
  const cases = [
    ['new Docker packages', basePlan + 'Inst containerd (1.7.28-0ubuntu1 Ubuntu:22.04/jammy-updates, Ubuntu:22.04/jammy-security [amd64])\n', 0],
    ['existing package upgrade', basePlan + 'Inst libc6 [2.35-0ubuntu1] (2.35-0ubuntu2 Ubuntu:22.04/jammy-updates [amd64])\n', 1],
    ['nginx removal', basePlan + 'Remv nginx [1.18.0]\n', 1],
    ['unrelated new app', basePlan + 'Inst nginx (1.18.0 Ubuntu:22.04/jammy [amd64])\n', 1],
    ['third-party origin', basePlan.replace('Ubuntu:22.04/jammy-updates', 'Docker:22.04/jammy'), 1],
    ['missing package', basePlan.split('\n')[0] + '\n', 1],
    ['duplicate package', basePlan + basePlan, 1],
  ];
  for (let index = 0; index < cases.length; index++) {
    const [name, body, status] = cases[index];
    const fixture = path.join(directory, `${index}.txt`);
    await writeFile(fixture, body);
    const result = run(['-c', `${parser}\nvalidate_apt_plan "$1"`, 'parser-test', fixture.replaceAll('\\', '/')]);
    assert.equal(result.status, status, `${name}: ${result.stderr}`);
    if (status === 0) assert.match(result.stdout, /^docker\.io=28\.2\.2/m);
  }
});

test('first-install guards and lock refuse overwriting a container environment', () => {
  assert.match(script, /\$EUID == 0/);
  assert.match(script, /VERSION_ID="22\.04"/);
  assert.match(script, /uname -m\) == x86_64/);
  assert.match(script, /flock -n 9 \|\| fail/);
  assert.match(script, /for tool in docker dockerd containerd ctr podman nerdctl crictl/);
  assert.match(script, /for unit_dir in \/etc\/systemd\/system \/run\/systemd\/system/);
  assert.match(script, /for unit in docker.service docker.socket containerd.service/);
  assert.match(script, /"\$unit_dir\/\$unit" "\$unit_dir\/\$unit.d"/);
  assert.match(script, /\[\[ -z "\$installed" \|\| "\$installed" == not-installed \]\] \|\| fail/);
  assert.match(script, /sysctl -n net\.ipv4\.ip_forward\) == 0/);
  assert.match(script, /bridges=\$\(ip -o link show type bridge\)/);
});

test('OS release accepts the standard symlink but rejects unsafe ownership, modes and targets', async (t) => {
  if (shell.error) return t.skip('Bash is not available; OS path fixtures not executed');
  const directory = await mkdtemp(path.join(os.tmpdir(), 'doso-bootstrap-os-'));
  t.after(async () => {
    assert.equal(path.dirname(directory), path.resolve(os.tmpdir()));
    assert.ok(path.basename(directory).startsWith('doso-bootstrap-os-'));
    await rm(directory, { recursive: true, force: true });
  });
  const canonical = path.join(directory, 'usr/lib/os-release');
  const link = path.join(directory, 'etc/os-release');
  const wrong = path.join(directory, 'etc/foreign-release');
  await mkdir(path.dirname(canonical), { recursive: true });
  await mkdir(path.dirname(link));
  await writeFile(canonical, 'ID=ubuntu\nVERSION_ID="22.04"\n');
  await writeFile(wrong, 'ID=foreign\n');
  await symlink('../usr/lib/os-release', link, 'file');
  const shellDirectory = process.platform === 'win32' ? `/tmp/${path.basename(directory)}` : directory;
  const shellLink = `${shellDirectory}/etc/os-release`;
  const shellCanonical = `${shellDirectory}/usr/lib/os-release`;
  const helper = script.split('# BEGIN OS RELEASE PATH CHECK\n')[1].split('# END OS RELEASE PATH CHECK')[0];
  for (const [uid, mode, expected] of [[0, '644', 0], [1000, '644', 1], [0, '664', 1], [0, '646', 1], [0, 'not-a-mode', 1]]) {
    const stub = `stat() { case "$2" in %u) printf '%s' '${uid}';; %a) printf '%s' '${mode}';; *) return 1;; esac; }`;
    const result = run(['-c', `${helper}\n${stub}\nvalidate_os_release_path "$1" "$2"`, 'os-test', shellLink, shellCanonical]);
    assert.equal(result.status, expected, `owner ${uid}, mode ${mode}: ${result.stderr}`);
  }
  const badTarget = run(['-c', `${helper}\nstat() { printf '0'; }\nvalidate_os_release_path "$1" "$2"`, 'os-test', shellLink, `${shellDirectory}/etc/foreign-release`]);
  assert.equal(badTarget.status, 1);
});

test('cloud failure reason is a fixed code and cannot echo arbitrary diagnostic text', (t) => {
  assert.match(script, /DOSO_BOOTSTRAP_REASON=%s/);
  assert.match(script, /validate_os_release_path \/etc\/os-release \/usr\/lib\/os-release \|\| fail os_release_unsafe/);
  if (shell.error) return t.skip('Bash is not available; reason fixture not executed');
  const helper = script.match(/fail\(\) \{[\s\S]*?\n\}/)[0];
  const result = run(['-c', `reason=unset\ntrap 'printf "%s" "$reason"' EXIT\n${helper}\nfail 'DO_NOT_ECHO_PRIVATE_DIAGNOSTIC'`]);
  assert.equal(result.status, 1);
  assert.equal(result.stdout, 'guard_rejected');
  assert.equal(result.stderr, '');
});

test('local container check rejects failed or timed-out empty Docker output', (t) => {
  if (shell.error) return t.skip('Bash is not available; container-check fixtures not executed');
  const helper = script.split('# BEGIN LOCAL CONTAINER CHECK\n')[1].split('# END LOCAL CONTAINER CHECK')[0];
  for (const [code, stdout, expected] of [[0, '', 0], [1, '', 1], [124, '', 1], [0, 'container-id', 1]]) {
    const result = run(['-c', `timeout() { shift; "$@"; }\ndocker() { printf '%s' '${stdout}'; return ${code}; }\n${helper}\ncheck_local_containers`]);
    assert.equal(result.status, expected, `docker status ${code}, stdout ${stdout}`);
  }
});

test('package operations are simulated, bounded, and cannot remove or upgrade old applications', () => {
  assert.match(script, /fuser \/var\/lib\/dpkg\/lock \/var\/lib\/dpkg\/lock-frontend/);
  assert.match(script, /DPkg::Lock::Timeout=0/);
  assert.match(script, /Acquire::Retries=0/);
  assert.match(script, /90s apt-get[^\n]+update/);
  assert.match(script, /30s apt-get[^\n]+-s --no-install-recommends --no-upgrade install docker\.io docker-compose-v2/);
  assert.match(script, /240s apt-get[^\n]+--no-remove --no-upgrade --no-install-recommends/);
  assert.ok(script.indexOf('validate_apt_plan "$log_dir/apt-plan.log"') < script.indexOf('stage=apt_install'));
  assert.match(script, /install "\$\{approved_packages\[@\]\}"/);
  assert.doesNotMatch(script, /\b(?:upgrade|dist-upgrade|autoremove)\s*>|(?:^|\n)\s*(?:ufw|firewall-cmd|usermod|groupmod)\s|curl[^\n]*\|\s*(?:sh|bash)|iptables[^\n]*\s-[FX]\b/);
});

test('default UFW forwarding exception cross-checks iptables and nft without accepting custom forwarding', () => {
  const python = process.platform === 'win32' ? 'C:/Users/99563/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe' : 'python3';
  const validator = script.split('# BEGIN DEFAULT UFW VALIDATOR\n')[1].split('# END DEFAULT UFW VALIDATOR')[0];
  const suffixes = ['before-logging-forward', 'before-forward', 'after-forward', 'after-logging-forward', 'reject-forward', 'track-forward', 'user-forward'];
  const nftables = [{ metainfo: { json_schema_version: 1 } }];
  function family(ipv6) {
    const prefix = ipv6 ? 'ufw6-' : 'ufw-';
    const family = ipv6 ? 'ip6' : 'ip';
    const lines = ['*filter', ':FORWARD DROP [0:0]', ...suffixes.map((suffix) => `:${prefix}${suffix} - [0:0]`)];
    nftables.push({ table: { family, name: 'filter' } });
    nftables.push({ chain: { family, table: 'filter', name: 'FORWARD', type: 'filter', hook: 'forward', prio: 0, policy: 'drop' } });
    for (const suffix of suffixes) nftables.push({ chain: { family, table: 'filter', name: prefix + suffix } });
    function rule(chain, tokens, expr) {
      lines.push(`-A ${chain} ${tokens}`);
      nftables.push({ rule: { family, table: 'filter', chain, expr: [{ counter: { packets: 12, bytes: 1000 } }, ...expr] } });
    }
    for (const suffix of suffixes.slice(0, 6)) rule('FORWARD', `-j ${prefix}${suffix}`, [{ jump: { target: prefix + suffix } }]);
    const before = `${prefix}before-forward`;
    if (ipv6) rule(before, '-m rt --rt-type 0 -j DROP', [{ xt: { type: 'match', name: 'rt' } }, { drop: null }]);
    rule(before, '-m conntrack --ctstate RELATED,ESTABLISHED -j ACCEPT', [{ match: { op: 'in', left: { ct: { key: 'state' } }, right: { set: ['established', 'related'] } } }, { accept: null }]);
    for (const kind of (ipv6 ? [1, 2, 3, 4, 128] : [3, 11, 12, 8])) {
      rule(before, `-p ${ipv6 ? 'ipv6-icmp -m icmp6 --icmpv6-type' : 'icmp -m icmp --icmp-type'} ${kind} -j ACCEPT`, [{ match: { op: '==', left: { payload: { protocol: ipv6 ? 'icmpv6' : 'icmp', field: 'type' } }, right: kind } }, { accept: null }]);
    }
    rule(before, `-j ${prefix}user-forward`, [{ jump: { target: `${prefix}user-forward` } }]);
    rule(`${prefix}after-logging-forward`, '-m limit --limit 3/min --limit-burst 10 -j LOG --log-prefix "[UFW BLOCK] "', [{ limit: { rate: 3, per: 'minute', burst: 10, unit: 'packets', inv: false } }, { log: { prefix: '[UFW BLOCK] ', level: 'warn' } }]);
    lines.push('COMMIT');
    return lines.join('\n');
  }
  const baseline = { v4: family(false), v6: family(true), nft: { nftables } };
  function addEchoReply(data, type = 129, afterUser = false) {
    const jump = '-A ufw6-before-forward -j ufw6-user-forward';
    const reply = `-A ufw6-before-forward -p ipv6-icmp -m icmp6 --icmpv6-type ${type} -j ACCEPT`;
    data.v6 = data.v6.replace(jump, afterUser ? `${jump}\n${reply}` : `${reply}\n${jump}`);
    const index = data.nft.nftables.findIndex((entry) => entry.rule?.family === 'ip6' && entry.rule.chain === 'ufw6-before-forward' && entry.rule.expr.some((expr) => afterUser ? expr.jump?.target === 'ufw6-user-forward' : expr.match?.right === 128));
    const request = data.nft.nftables.find((entry) => entry.rule?.family === 'ip6' && entry.rule.chain === 'ufw6-before-forward' && entry.rule.expr.some((expr) => expr.match?.right === 128));
    const replyRule = structuredClone(request);
    replyRule.rule.expr.find((expr) => expr.match?.right === 128).match.right = type;
    data.nft.nftables.splice(index + 1, 0, replyRule);
  }
  // Verbatim normalized before-forward lines from attempt03/diagnose-forward-shape-output.txt.
  // These are real observed iptables semantics; the nft fixtures remain independently constructed.
  const observedIpv6Before = [
    '-A ufw6-before-forward -m rt --rt-type 0 -j DROP',
    '-A ufw6-before-forward -m conntrack --ctstate RELATED,ESTABLISHED -j ACCEPT',
    '-A ufw6-before-forward -p ipv6-icmp -m icmp6 --icmpv6-type 1 -j ACCEPT',
    '-A ufw6-before-forward -p ipv6-icmp -m icmp6 --icmpv6-type 2 -j ACCEPT',
    '-A ufw6-before-forward -p ipv6-icmp -m icmp6 --icmpv6-type 3 -j ACCEPT',
    '-A ufw6-before-forward -p ipv6-icmp -m icmp6 --icmpv6-type 4 -j ACCEPT',
    '-A ufw6-before-forward -p ipv6-icmp -m icmp6 --icmpv6-type 128 -j ACCEPT',
    '-A ufw6-before-forward -p ipv6-icmp -m icmp6 --icmpv6-type 129 -j ACCEPT',
    '-A ufw6-before-forward -j ufw6-user-forward',
  ];
  // Complete sanitized forward closure captured in attempt04; counters/handles were omitted by that read-only export.
  const observedNftRows = [{"kind":"chain","family":"ip","name":"ufw-before-logging-forward","type":null,"hook":null,"prio":null,"policy":null},{"kind":"chain","family":"ip","name":"ufw-before-forward","type":null,"hook":null,"prio":null,"policy":null},{"kind":"rule","family":"ip","chain":"ufw-before-forward","expr":[{"xt":null},{"accept":null}]},{"kind":"rule","family":"ip","chain":"ufw-before-forward","expr":[{"match":{"op":"==","left":{"meta":{"key":"l4proto"}},"right":"icmp"}},{"xt":null},{"accept":null}]},{"kind":"rule","family":"ip","chain":"ufw-before-forward","expr":[{"match":{"op":"==","left":{"meta":{"key":"l4proto"}},"right":"icmp"}},{"xt":null},{"accept":null}]},{"kind":"rule","family":"ip","chain":"ufw-before-forward","expr":[{"match":{"op":"==","left":{"meta":{"key":"l4proto"}},"right":"icmp"}},{"xt":null},{"accept":null}]},{"kind":"rule","family":"ip","chain":"ufw-before-forward","expr":[{"match":{"op":"==","left":{"meta":{"key":"l4proto"}},"right":"icmp"}},{"xt":null},{"accept":null}]},{"kind":"rule","family":"ip","chain":"ufw-before-forward","expr":[{"jump":{"target":"ufw-user-forward"}}]},{"kind":"chain","family":"ip","name":"ufw-after-forward","type":null,"hook":null,"prio":null,"policy":null},{"kind":"chain","family":"ip","name":"ufw-after-logging-forward","type":null,"hook":null,"prio":null,"policy":null},{"kind":"rule","family":"ip","chain":"ufw-after-logging-forward","expr":[{"limit":{"rate":3,"burst":10,"per":"minute"}},{"xt":null}]},{"kind":"chain","family":"ip","name":"ufw-reject-forward","type":null,"hook":null,"prio":null,"policy":null},{"kind":"chain","family":"ip","name":"ufw-track-forward","type":null,"hook":null,"prio":null,"policy":null},{"kind":"chain","family":"ip","name":"FORWARD","type":"filter","hook":"forward","prio":0,"policy":"drop"},{"kind":"rule","family":"ip","chain":"FORWARD","expr":[{"jump":{"target":"ufw-before-logging-forward"}}]},{"kind":"rule","family":"ip","chain":"FORWARD","expr":[{"jump":{"target":"ufw-before-forward"}}]},{"kind":"rule","family":"ip","chain":"FORWARD","expr":[{"jump":{"target":"ufw-after-forward"}}]},{"kind":"rule","family":"ip","chain":"FORWARD","expr":[{"jump":{"target":"ufw-after-logging-forward"}}]},{"kind":"rule","family":"ip","chain":"FORWARD","expr":[{"jump":{"target":"ufw-reject-forward"}}]},{"kind":"rule","family":"ip","chain":"FORWARD","expr":[{"jump":{"target":"ufw-track-forward"}}]},{"kind":"chain","family":"ip","name":"ufw-user-forward","type":null,"hook":null,"prio":null,"policy":null},{"kind":"chain","family":"ip6","name":"ufw6-before-logging-forward","type":null,"hook":null,"prio":null,"policy":null},{"kind":"chain","family":"ip6","name":"ufw6-before-forward","type":null,"hook":null,"prio":null,"policy":null},{"kind":"rule","family":"ip6","chain":"ufw6-before-forward","expr":[{"xt":null},{"drop":null}]},{"kind":"rule","family":"ip6","chain":"ufw6-before-forward","expr":[{"xt":null},{"accept":null}]},{"kind":"rule","family":"ip6","chain":"ufw6-before-forward","expr":[{"match":{"op":"==","left":{"meta":{"key":"l4proto"}},"right":"ipv6-icmp"}},{"xt":null},{"accept":null}]},{"kind":"rule","family":"ip6","chain":"ufw6-before-forward","expr":[{"match":{"op":"==","left":{"meta":{"key":"l4proto"}},"right":"ipv6-icmp"}},{"xt":null},{"accept":null}]},{"kind":"rule","family":"ip6","chain":"ufw6-before-forward","expr":[{"match":{"op":"==","left":{"meta":{"key":"l4proto"}},"right":"ipv6-icmp"}},{"xt":null},{"accept":null}]},{"kind":"rule","family":"ip6","chain":"ufw6-before-forward","expr":[{"match":{"op":"==","left":{"meta":{"key":"l4proto"}},"right":"ipv6-icmp"}},{"xt":null},{"accept":null}]},{"kind":"rule","family":"ip6","chain":"ufw6-before-forward","expr":[{"match":{"op":"==","left":{"meta":{"key":"l4proto"}},"right":"ipv6-icmp"}},{"xt":null},{"accept":null}]},{"kind":"rule","family":"ip6","chain":"ufw6-before-forward","expr":[{"match":{"op":"==","left":{"meta":{"key":"l4proto"}},"right":"ipv6-icmp"}},{"xt":null},{"accept":null}]},{"kind":"rule","family":"ip6","chain":"ufw6-before-forward","expr":[{"jump":{"target":"ufw6-user-forward"}}]},{"kind":"chain","family":"ip6","name":"ufw6-after-forward","type":null,"hook":null,"prio":null,"policy":null},{"kind":"chain","family":"ip6","name":"ufw6-after-logging-forward","type":null,"hook":null,"prio":null,"policy":null},{"kind":"rule","family":"ip6","chain":"ufw6-after-logging-forward","expr":[{"limit":{"rate":3,"burst":10,"per":"minute"}},{"xt":null}]},{"kind":"chain","family":"ip6","name":"ufw6-reject-forward","type":null,"hook":null,"prio":null,"policy":null},{"kind":"chain","family":"ip6","name":"ufw6-track-forward","type":null,"hook":null,"prio":null,"policy":null},{"kind":"chain","family":"ip6","name":"FORWARD","type":"filter","hook":"forward","prio":0,"policy":"drop"},{"kind":"rule","family":"ip6","chain":"FORWARD","expr":[{"jump":{"target":"ufw6-before-logging-forward"}}]},{"kind":"rule","family":"ip6","chain":"FORWARD","expr":[{"jump":{"target":"ufw6-before-forward"}}]},{"kind":"rule","family":"ip6","chain":"FORWARD","expr":[{"jump":{"target":"ufw6-after-forward"}}]},{"kind":"rule","family":"ip6","chain":"FORWARD","expr":[{"jump":{"target":"ufw6-after-logging-forward"}}]},{"kind":"rule","family":"ip6","chain":"FORWARD","expr":[{"jump":{"target":"ufw6-reject-forward"}}]},{"kind":"rule","family":"ip6","chain":"FORWARD","expr":[{"jump":{"target":"ufw6-track-forward"}}]},{"kind":"chain","family":"ip6","name":"ufw6-user-forward","type":null,"hook":null,"prio":null,"policy":null}];
  function useObservedNft(data) {
    addEchoReply(data);
    data.nft = { nftables: observedNftRows.map((row) => row.kind === 'rule'
      ? { rule: { family: row.family, table: 'filter', chain: row.chain, expr: structuredClone(row.expr) } }
      : { chain: Object.fromEntries(Object.entries({ family: row.family, table: 'filter', name: row.name, type: row.type, hook: row.hook, prio: row.prio, policy: row.policy }).filter(([, value]) => value !== null)) }) };
  }
  const driver = `import json,sys\nscope={'__name__':'fixture'}\nexec(${JSON.stringify(validator)},scope)\ndata=json.loads(sys.argv[1])\ntry:\n scope['validate'](data['v4'],data['v6'],data['nft'])\nexcept ValueError as error:\n print(str(error));sys.exit(1)\nprint('accepted')\n`;
  const cases = [
    ['default UFW only', () => {}, 0],
    ['complete real Ubuntu nft xt-null closure', (data) => { useObservedNft(data); }, 0],
    ['root mark setter beside jump', (data) => { useObservedNft(data); data.nft.nftables.find((entry) => entry.rule?.chain === 'FORWARD').rule.expr.unshift({ mangle: { key: { meta: { key: 'mark' } }, value: 1 } }); }, 1],
    ['root mark setter left-right representation', (data) => { useObservedNft(data); data.nft.nftables.find((entry) => entry.rule?.chain === 'FORWARD').rule.expr.unshift({ mangle: { left: { meta: { key: 'mark' } }, right: 123 } }); }, 1],
    ['hidden extra expression beside xt', (data) => { useObservedNft(data); data.nft.nftables.find((entry) => entry.rule?.chain === 'ufw-before-forward').rule.expr.push({ xt: null }); }, 1],
    ['wrong conntrack verdict', (data) => { useObservedNft(data); data.nft.nftables.find((entry) => entry.rule?.chain === 'ufw-before-forward').rule.expr[1] = { drop: null }; }, 1],
    ['wrong routing-header verdict', (data) => { useObservedNft(data); data.nft.nftables.find((entry) => entry.rule?.chain === 'ufw6-before-forward').rule.expr[1] = { accept: null }; }, 1],
    ['wrong xt expression position', (data) => { useObservedNft(data); data.nft.nftables.find((entry) => entry.rule?.chain === 'ufw-before-forward').rule.expr.reverse(); }, 1],
    ['wrong ICMP protocol match', (data) => { useObservedNft(data); data.nft.nftables.find((entry) => entry.rule?.expr.some((expr) => expr.match?.right === 'icmp')).rule.expr[0].match.right = 'tcp'; }, 1],
    ['extra verdict beside opaque LOG', (data) => { useObservedNft(data); data.nft.nftables.find((entry) => entry.rule?.chain === 'ufw-after-logging-forward').rule.expr.push({ accept: null }); }, 1],
    ['opaque LOG wrong rate', (data) => { useObservedNft(data); data.nft.nftables.find((entry) => entry.rule?.chain === 'ufw-after-logging-forward').rule.expr[0].limit.rate = 4; }, 1],
    ['root jump cannot be opaque xt', (data) => { useObservedNft(data); data.nft.nftables.find((entry) => entry.rule?.chain === 'FORWARD').rule.expr = [{ xt: null }]; }, 1],
    ['observed host IPv6 echo-reply variant', (data) => { addEchoReply(data); data.v6 = data.v6.split('\n').filter((line) => !line.startsWith('-A ufw6-before-forward ')).join('\n').replace('COMMIT', `${observedIpv6Before.join('\n')}\nCOMMIT`); }, 0],
    ['echo-reply nft symbolic type', (data) => { addEchoReply(data); data.nft.nftables.find((entry) => entry.rule?.chain === 'ufw6-before-forward' && entry.rule.expr.some((expr) => expr.match?.right === 129)).rule.expr.find((expr) => expr.match?.right === 129).match.right = 'echo-reply'; }, 0],
    ['type130 is not a default echo-reply', (data) => { addEchoReply(data, 130); }, 1],
    ['duplicate echo-reply', (data) => { addEchoReply(data); addEchoReply(data); }, 1],
    ['echo-reply after user rules', (data) => { addEchoReply(data, 129, true); }, 1],
    ['echo-reply before echo-request', (data) => { addEchoReply(data); const request = '-A ufw6-before-forward -p ipv6-icmp -m icmp6 --icmpv6-type 128 -j ACCEPT'; const reply = request.replace('128', '129'); data.v6 = data.v6.replace(`${request}\n${reply}`, `${reply}\n${request}`); }, 1],
    ['extra root rule', (data) => { data.v4 = data.v4.replace('COMMIT', '-A FORWARD -j ACCEPT\nCOMMIT'); }, 1],
    ['user forward route', (data) => { data.v4 = data.v4.replace('COMMIT', '-A ufw-user-forward -j ACCEPT\nCOMMIT'); }, 1],
    ['before forward custom accept', (data) => { data.v4 = data.v4.replace('COMMIT', '-A ufw-before-forward -j ACCEPT\nCOMMIT'); }, 1],
    ['IPv6 user forward route', (data) => { data.v6 = data.v6.replace('COMMIT', '-A ufw6-user-forward -j ACCEPT\nCOMMIT'); }, 1],
    ['NAT rules', (data) => { data.v4 += '\n*nat\n:POSTROUTING ACCEPT [0:0]\n-A POSTROUTING -j MASQUERADE\nCOMMIT'; }, 1],
    ['foreign forwarding hook', (data) => { data.nft.nftables.push({ chain: { family: 'inet', table: 'custom', name: 'forward', type: 'filter', hook: 'forward', prio: 0, policy: 'drop' } }); }, 1],
    ['foreign NAT hook', (data) => { data.nft.nftables.push({ chain: { family: 'ip', table: 'custom', name: 'nat', type: 'nat', hook: 'postrouting', prio: 100, policy: 'accept' } }); }, 1],
    ['unknown reachable nft expression', (data) => { data.nft.nftables.find((entry) => entry.rule?.chain === 'ufw-before-forward').rule.expr.push({ verdict_map: {} }); }, 1],
    ['extra nft forward rule', (data) => { data.nft.nftables.push({ rule: { family: 'ip', table: 'filter', chain: 'ufw-before-forward', expr: [{ accept: null }] } }); }, 1],
    ['native NAT statement', (data) => { data.nft.nftables.push({ rule: { family: 'ip', table: 'filter', chain: 'INPUT', expr: [{ redirect: { port: 80 } }] } }); }, 1],
    ['native INPUT and OUTPUT rules retained', (data) => { for (const name of ['INPUT', 'OUTPUT']) { data.nft.nftables.push({ chain: { family: 'ip', table: 'filter', name, type: 'filter', hook: name.toLowerCase(), prio: 0, policy: 'accept' } }); data.nft.nftables.push({ rule: { family: 'ip', table: 'filter', chain: name, expr: [{ accept: null }] } }); } }, 0],
  ];
  for (const [name, mutate, status] of cases) {
    const data = structuredClone(baseline);
    mutate(data);
    const result = spawnSync(python, ['-c', driver, JSON.stringify(data)], { encoding: 'utf8', timeout: 10000 });
    assert.equal(result.status, status, `${name}: ${result.stdout} ${result.stderr}`);
    if (status === 0) assert.equal(result.stdout.trim(), 'accepted');
    else assert.match(result.stdout, /^firewall_(?:forward_not_default|nft_mismatch)\s*$/);
  }
  assert.match(script, /net\.ipv6\.conf\.all\.forwarding\) == 0/);
  assert.match(script, /net\.ipv6\.conf\.default\.forwarding\) == 0/);
  assert.match(script, /nft -j list ruleset/);
});

test('website evidence is hashed and detailed logs are root-only with fixed cloud output', () => {
  assert.match(script, /umask 077/);
  assert.match(script, /stat -c %u "\$directory"\) == 0/);
  assert.match(script, /stat -c %a "\$directory"\) == 700/);
  assert.match(script, /mktemp -d \/var\/log\/doso-bootstrap\/run-XXXXXXXX/);
  assert.match(script, /nginx -T 2>&1 \| sha256sum/);
  assert.match(script, /\[\[ "\$code" == 200 \]\]/);
  assert.match(script, /cmp -s "\$log_dir\/nginx-before.sha256" "\$log_dir\/nginx-after.sha256"/);
  assert.match(script, /cmp -s "\$log_dir\/http-before.sha256" "\$log_dir\/http-after.sha256"/);
  assert.match(script, /DOSO_DOCKER_BOOTSTRAP_V1/);
  assert.match(script, /DOSO_DOCKER_BOOTSTRAP_END/);
  assert.match(script, /docker --host unix:\/\/\/var\/run\/docker.sock ps --all --quiet/);
  assert.match(script, /DOSO_DOCKER_VERSION=%s/);
  assert.match(script, /DOSO_WEBSITE_HTTP_200_UNCHANGED=true/);
  assert.match(script, /DOSO_NGINX_CONFIG_HASH_UNCHANGED=true/);
  assert.match(script, /DOSO_BOOTSTRAP_RUN=%s/);
  assert.match(script, /grep -q '"dockerd"'/);
  assert.doesNotMatch(script, /set -[^\n]*x|\bdocker (?:run|pull|login)\b|\bsystemctl (?:restart|stop) nginx\b/);
});
