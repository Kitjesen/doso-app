#!/usr/bin/env bash
# Reviewed first-install path for the existing Ubuntu 22.04 amd64 host.
# Docker may create its own bridge/NAT rules. Existing forwarding workloads stop this script.
set -Eeuo pipefail
umask 077
export PATH=/usr/sbin:/usr/bin:/sbin:/bin LC_ALL=C
unset APT_CONFIG BASH_ENV ENV DOCKER_HOST DOCKER_CONTEXT
stage=preflight
result=failed
reason=unexpected_command_failure
run_name=not_created
printf 'DOSO_DOCKER_BOOTSTRAP_V1\n'
finish() {
  printf 'DOSO_BOOTSTRAP_RUN=%s\nDOSO_BOOTSTRAP_STAGE=%s\nDOSO_BOOTSTRAP_RESULT=%s\nDOSO_BOOTSTRAP_REASON=%s\nDOSO_DOCKER_BOOTSTRAP_END\n' "$run_name" "$stage" "$result" "$reason"
}
trap finish EXIT
fail() {
  case "${1:-guard_rejected}" in
    guard_rejected|invalid_execution_context|architecture_unsupported|os_release_unsafe|os_unsupported|tool_missing|forwarding_enabled|bridge_present|firewall_read_failed|firewall_forward_not_default|firewall_nft_mismatch|firewall_parse_failed) reason=${1:-guard_rejected} ;;
    *) reason=guard_rejected ;;
  esac
  exit 1
}
# BEGIN OS RELEASE PATH CHECK
validate_os_release_path() {
  local release=$1 canonical=$2 resolved owner mode
  [[ -f "$release" ]] || return 1
  if [[ -L "$release" ]]; then
    [[ -f "$canonical" && ! -L "$canonical" ]] || return 1
    owner=$(stat -c %u "$release") || return 1
    [[ "$owner" == 0 ]] || return 1
    resolved=$(readlink -e "$release") || return 1
    canonical=$(readlink -e "$canonical") || return 1
    [[ "$resolved" == "$canonical" ]] || return 1
  else
    resolved=$release
  fi
  owner=$(stat -c %u "$resolved") || return 1
  mode=$(stat -c %a "$resolved") || return 1
  [[ "$owner" == 0 && "$mode" =~ ^[0-7]{3,4}$ ]] || return 1
  (( (8#$mode & 8#022) == 0 ))
}
# END OS RELEASE PATH CHECK
[[ $# == 0 && $EUID == 0 ]] || fail invalid_execution_context
[[ $(uname -m) == x86_64 ]] || fail architecture_unsupported
for tool in flock stat readlink install mktemp timeout curl nginx sha256sum awk ss fuser dpkg-query apt-get systemctl ip sysctl pgrep python3 iptables-save ip6tables-save nft; do
  command -v "$tool" >/dev/null || fail tool_missing
done
validate_os_release_path /etc/os-release /usr/lib/os-release || fail os_release_unsafe
grep -qx 'ID=ubuntu' /etc/os-release || fail os_unsupported
grep -qx 'VERSION_ID="22.04"' /etc/os-release || fail os_unsupported

# These private directories are never reused if ownership or permissions differ.
for directory in /run/doso-bootstrap /var/log/doso-bootstrap; do
  if [[ -e "$directory" || -L "$directory" ]]; then
    [[ -d "$directory" && ! -L "$directory" && $(stat -c %u "$directory") == 0 && $(stat -c %a "$directory") == 700 ]] || fail
  else
    install -d -m 700 -o root -g root "$directory"
  fi
done
[[ ! -L /run/doso-bootstrap/install.lock ]] || fail
exec 9>>/run/doso-bootstrap/install.lock
flock -n 9 || fail
log_dir=$(mktemp -d /var/log/doso-bootstrap/run-XXXXXXXX)
run_name=${log_dir##*/}
# Detailed diagnostics remain root-only; cloud stdout contains fixed status fields only.
exec 2>"$log_dir/shell-errors.log"
exec 3>"$log_dir/status.log"
printf 'docker_owns_new_bridge_nat_rules=true\nexisting_firewall_rules_must_not_be_flushed=true\n' >&3

stage=conflict_check
for tool in docker dockerd containerd ctr podman nerdctl crictl; do
  if command -v "$tool" >/dev/null; then fail; fi
done
if pgrep -x 'dockerd|containerd|podman|conmon|crio' >"$log_dir/container-processes.before"; then fail; fi
for directory in /var/lib/docker /etc/docker /var/lib/containerd /etc/containerd /run/docker.sock /etc/default/docker; do
  [[ ! -e "$directory" && ! -L "$directory" ]] || fail
done
for unit_dir in /etc/systemd/system /run/systemd/system /usr/local/lib/systemd/system /usr/lib/systemd/system /lib/systemd/system; do
  for unit in docker.service docker.socket containerd.service; do
    for existing_unit in "$unit_dir/$unit" "$unit_dir/$unit.d"; do
      [[ ! -e "$existing_unit" && ! -L "$existing_unit" ]] || fail
    done
  done
done
for package in docker.io docker-ce docker-ce-cli docker-compose-v2 containerd containerd.io runc podman; do
  if installed=$(dpkg-query -W -f='${db:Status-Status}' "$package" 2>"$log_dir/package-query.error"); then
    [[ -z "$installed" || "$installed" == not-installed ]] || fail
  else
    [[ $? == 1 ]] || fail
  fi
done
[[ $(sysctl -n net.ipv4.ip_forward) == 0 ]] || fail forwarding_enabled
[[ $(sysctl -n net.ipv6.conf.all.forwarding) == 0 ]] || fail forwarding_enabled
[[ $(sysctl -n net.ipv6.conf.default.forwarding) == 0 ]] || fail forwarding_enabled
bridges=$(ip -o link show type bridge)
[[ -z "$bridges" ]] || fail bridge_present
for tool in iptables-save ip6tables-save; do
  timeout 5 "$tool" >"$log_dir/$tool.before" || fail firewall_read_failed
done
timeout 5 nft -j list ruleset >"$log_dir/nft.before.json" || fail firewall_read_failed
forward_reason=$(timeout 10 python3 - "$log_dir/iptables-save.before" "$log_dir/ip6tables-save.before" "$log_dir/nft.before.json" <<'PY'
# BEGIN DEFAULT UFW VALIDATOR
import json
import shlex
import sys
from collections import defaultdict

def require(condition, code='firewall_forward_not_default'):
    if not condition:
        raise ValueError(code)

def read_bounded(name):
    with open(name, encoding='utf-8') as source:
        value = source.read(2 * 1024 * 1024 + 1)
    require(len(value) <= 2 * 1024 * 1024, 'firewall_parse_failed')
    return value

def expected_rules(prefix, ipv6):
    suffixes = ['before-logging-forward', 'before-forward', 'after-forward', 'after-logging-forward', 'reject-forward', 'track-forward']
    rules = {'FORWARD': [('jump', prefix + suffix) for suffix in suffixes]}
    rules.update({prefix + suffix: [] for suffix in suffixes + ['user-forward']})
    before = rules[prefix + 'before-forward']
    if ipv6:
        before.append(('rt0',))
    before.append(('established',))
    for kind in ([1, 2, 3, 4, 128] if ipv6 else [3, 11, 12, 8]):
        before.append(('icmp6' if ipv6 else 'icmp', kind))
    before.append(('jump', prefix + 'user-forward'))
    return rules

def iptables_view(text, prefix, ipv6):
    chains = {}
    rules = defaultdict(list)
    table = None
    for line in text.splitlines():
        if not line or line.startswith('#'):
            continue
        if line.startswith('*'):
            table = line[1:]
        elif line == 'COMMIT':
            table = None
        elif line.startswith(':') and table == 'filter':
            fields = line.split()
            require(fields[0][1:] not in chains)
            chains[fields[0][1:]] = fields[1]
        elif line.startswith('-A '):
            fields = shlex.split(line)
            # Non-filter rules may implement NAT, routing, or policy outside UFW.
            require(table == 'filter')
            rules[fields[1]].append(fields[2:])
        else:
            require(line.startswith(':'))
    expected = expected_rules(prefix, ipv6)
    require(chains.get('FORWARD') == 'DROP')
    require(all(name in chains for name in expected))
    require(not rules[prefix + 'user-forward'])
    normalized = {}
    for chain, wanted in expected.items():
        actual = []
        for tokens in rules[chain]:
            if len(tokens) == 8 and tokens[:4] in [['-p', 'icmp', '-m', 'icmp'], ['-p', 'ipv6-icmp', '-m', 'icmp6']]:
                tokens = tokens[:2] + tokens[4:]
            if tokens[:1] == ['-j'] and len(tokens) == 2:
                actual.append(('jump', tokens[1]))
            elif tokens == ['-m', 'conntrack', '--ctstate', 'RELATED,ESTABLISHED', '-j', 'ACCEPT']:
                actual.append(('established',))
            elif tokens == ['-p', 'ipv6-icmp', '-m', 'rt', '--rt-type', '0', '-j', 'DROP'] or tokens == ['-m', 'rt', '--rt-type', '0', '-j', 'DROP']:
                actual.append(('rt0',))
            elif len(tokens) == 6 and tokens[0] == '-p' and tokens[1] in ['icmp', 'ipv6-icmp', 'icmpv6'] and tokens[2] in ['--icmp-type', '--icmpv6-type'] and tokens[4:] == ['-j', 'ACCEPT']:
                actual.append(('icmp6' if ipv6 else 'icmp', int(tokens[3])))
            elif tokens == ['-m', 'limit', '--limit', '3/min', '--limit-burst', '10', '-j', 'LOG', '--log-prefix', '[UFW BLOCK] ']:
                actual.append(('log',))
            else:
                require(False)
        # The only optional default logging rule is UFW's rate-limited block log.
        if chain == prefix + 'after-logging-forward' and actual == [('log',)]:
            wanted = actual
        # Observed Ubuntu UFW variant: one echo-reply after echo-request, before user rules.
        if ipv6 and chain == prefix + 'before-forward' and len(actual) == len(wanted) + 1 and actual[-2] == ('icmp6', 129):
            wanted = wanted[:-1] + [('icmp6', 129), wanted[-1]]
        require(actual == wanted)
        normalized[chain] = actual
    return normalized

def without_counters(expressions):
    kept = []
    for item in expressions:
        require(isinstance(item, dict) and len(item) == 1, 'firewall_nft_mismatch')
        if 'counter' in item:
            counter = item['counter']
            require(isinstance(counter, dict) and set(counter) <= {'packets', 'bytes'} and all(type(value) is int and value >= 0 for value in counter.values()), 'firewall_nft_mismatch')
        else:
            kept.append(item)
    return kept

def nft_rule_matches(expressions, wanted):
    expr = without_counters(expressions)
    kind = wanted[0]
    if kind == 'jump':
        return expr == [{'jump': {'target': wanted[1]}}]
    if kind == 'established':
        # Ubuntu may omit legacy xt payloads; the same-ordinal canonical rule is already exact.
        return expr == [{'xt': None}, {'accept': None}] or len(expr) == 2 and expr[1] == {'accept': None} and expr[0] in [
            {'match': {'op': 'in', 'left': {'ct': {'key': 'state'}}, 'right': {'set': order}}}
            for order in [['related', 'established'], ['established', 'related']]]
    if kind in ['icmp', 'icmp6']:
        protocol = 'icmpv6' if kind == 'icmp6' else 'icmp'
        names = ({1: 'destination-unreachable', 2: 'packet-too-big', 3: 'time-exceeded', 4: 'parameter-problem', 128: 'echo-request', 129: 'echo-reply'} if kind == 'icmp6' else {3: 'destination-unreachable', 11: 'time-exceeded', 12: 'parameter-problem', 8: 'echo-request'})
        matches = [
            {'match': {'op': '==', 'left': {'payload': {'protocol': protocol, 'field': 'type'}}, 'right': value}}
            for value in [wanted[1], names[wanted[1]]]
        ]
        if len(expr) == 3 and expr[0] == {'match': {'op': '==', 'left': {'meta': {'key': 'l4proto'}}, 'right': 'ipv6-icmp' if kind == 'icmp6' else 'icmp'}}:
            expr = expr[1:]
        return len(expr) == 2 and expr[0] in matches + [{'xt': None}] and expr[1] == {'accept': None}
    if kind == 'rt0':
        # xt payload is opaque in nft JSON; its same-index iptables rule above must be exactly rt-type 0.
        return expr in [[{'xt': None}, {'drop': None}], [{'xt': {'type': 'match', 'name': 'rt'}}, {'drop': None}], [{'match': {'op': '==', 'left': {'rt': {'key': 'type'}}, 'right': 0}}, {'drop': None}]]
    if kind == 'log':
        if len(expr) != 2 or set(expr[0]) != {'limit'} or not (set(expr[1]) == {'log'} or expr[1] == {'xt': None}):
            return False
        limit, log = expr[0]['limit'], expr[1].get('log')
        valid_log = expr[1] == {'xt': None} or isinstance(log, dict) and set(log) <= {'prefix', 'level'} and log.get('prefix') == '[UFW BLOCK] ' and log.get('level', 'warn') == 'warn'
        return isinstance(limit, dict) and set(limit) <= {'rate', 'per', 'burst', 'unit', 'inv'} and limit.get('rate') == 3 and limit.get('per') == 'minute' and limit.get('burst') == 10 and limit.get('unit', 'packets') == 'packets' and limit.get('inv', False) is False and valid_log
    return False

def validate(v4, v6, nft):
    views = {'ip': iptables_view(v4, 'ufw-', False), 'ip6': iptables_view(v6, 'ufw6-', True)}
    require(isinstance(nft, dict) and isinstance(nft.get('nftables'), list), 'firewall_parse_failed')
    chains = {}
    rules = defaultdict(list)
    hooks = set()
    for entry in nft['nftables']:
        require(isinstance(entry, dict) and len(entry) == 1, 'firewall_nft_mismatch')
        if 'chain' in entry:
            chain = entry['chain']
            key = (chain['family'], chain['table'], chain['name'])
            require(key not in chains, 'firewall_nft_mismatch')
            chains[key] = chain
            hook = chain.get('hook')
            if hook not in [None, 'input', 'output'] or chain.get('type') == 'nat':
                require(key in [('ip', 'filter', 'FORWARD'), ('ip6', 'filter', 'FORWARD')] and hook == 'forward' and chain.get('type') == 'filter' and chain.get('prio') == 0 and chain.get('policy') == 'drop', 'firewall_nft_mismatch')
                hooks.add(key)
        elif 'rule' in entry:
            rule = entry['rule']
            def contains_nat(value):
                if isinstance(value, dict):
                    return bool(set(value) & {'snat', 'dnat', 'masquerade', 'redirect'}) or any(contains_nat(item) for item in value.values())
                return isinstance(value, list) and any(contains_nat(item) for item in value)
            require(not contains_nat(rule['expr']), 'firewall_nft_mismatch')
            rules[(rule['family'], rule['table'], rule['chain'])].append(rule['expr'])
        elif not any(key in entry for key in ['metainfo', 'table']):
            require(False, 'firewall_nft_mismatch')
    require(hooks == {('ip', 'filter', 'FORWARD'), ('ip6', 'filter', 'FORWARD')}, 'firewall_nft_mismatch')
    for family, expected in views.items():
        for name, wanted in expected.items():
            key = (family, 'filter', name)
            require(key in chains and len(rules[key]) == len(wanted), 'firewall_nft_mismatch')
            if name != 'FORWARD':
                require(not any(field in chains[key] for field in ['hook', 'type', 'policy']), 'firewall_nft_mismatch')
            require(all(nft_rule_matches(actual, target) for actual, target in zip(rules[key], wanted)), 'firewall_nft_mismatch')

if __name__ == '__main__':
    try:
        validate(read_bounded(sys.argv[1]), read_bounded(sys.argv[2]), json.loads(read_bounded(sys.argv[3])))
    except ValueError as error:
        code = str(error)
        print(code if code in ['firewall_forward_not_default', 'firewall_nft_mismatch', 'firewall_parse_failed'] else 'firewall_parse_failed')
        sys.exit(1)
    except Exception:
        print('firewall_parse_failed')
        sys.exit(1)
    print('default_ufw_forwarding_only')
# END DEFAULT UFW VALIDATOR
PY
) || fail "$forward_reason"
printf 'firewall_preflight=%s\n' "$forward_reason" >&3

stage=resource_check
[[ $(awk '/^MemAvailable:/{print $2}' /proc/meminfo) -ge 1048576 ]] || fail
[[ $(df -Pk / | awk 'NR==2{print $4}') -ge 5242880 ]] || fail
[[ $(df -Pi / | awk 'NR==2{print $4}') -ge 100000 ]] || fail

apt_idle() {
  local audit
  if fuser /var/lib/dpkg/lock /var/lib/dpkg/lock-frontend /var/lib/apt/lists/lock /var/cache/apt/archives/lock >>"$log_dir/package-locks.log" 2>&1; then return 1; fi
  audit=$(dpkg --audit) || return 1
  [[ -z "$audit" ]]
}
website_snapshot() {
  local phase=$1 code
  timeout 15 nginx -T 2>&1 | sha256sum | awk '{print $1}' >"$log_dir/nginx-$phase.sha256"
  code=$(curl --noproxy '*' --connect-timeout 5 --max-time 15 --resolve inovxio.com:80:127.0.0.1 \
    --output "$log_dir/http-$phase.body" --write-out '%{http_code}' http://inovxio.com/ 2>"$log_dir/http-$phase.error")
  [[ "$code" == 200 ]] || return 1
  sha256sum <"$log_dir/http-$phase.body" | awk '{print $1}' >"$log_dir/http-$phase.sha256"
}

# BEGIN APT PLAN VALIDATOR: pure parser, also exercised with unprivileged fixtures.
validate_apt_plan() {
  local line package version origins origin seen_docker=0 seen_compose=0
  local -a source_origins
  local -A seen=()
  while IFS= read -r line; do
    [[ "$line" != Remv* ]] || return 1
    [[ "$line" == Inst\ * ]] || continue
    [[ "$line" =~ ^Inst[[:space:]]([a-z0-9.+:-]+)[[:space:]]\(([^[:space:]]+)[[:space:]](.+)[[:space:]]\[(amd64|all)\]\)$ ]] || return 1
    package=${BASH_REMATCH[1]}; version=${BASH_REMATCH[2]}; origins=${BASH_REMATCH[3]}
    case "$package" in
      docker.io|docker-compose-v2|containerd|runc|tini|iptables|apparmor|bridge-utils|cgroupfs-mount|libip4tc2|libip6tc2|libxtables12|libnetfilter-conntrack3|libnfnetlink0|libnftnl11|libnftables1|nftables|libmnl0|libslirp0|slirp4netns|libdevmapper1.02.1|libseccomp2|libltdl7|libapparmor1) ;;
      *) return 1 ;;
    esac
    [[ "$version" =~ ^[a-zA-Z0-9.+:~_-]+$ && -z ${seen[$package]+present} ]] || return 1
    seen[$package]=1
    IFS=',' read -r -a source_origins <<<"$origins"
    for origin in "${source_origins[@]}"; do
      origin="${origin#"${origin%%[![:space:]]*}"}"
      [[ "$origin" =~ ^Ubuntu:22\.04/jammy(-updates|-security)?$ ]] || return 1
    done
    [[ "$package" != docker.io ]] || seen_docker=1
    [[ "$package" != docker-compose-v2 ]] || seen_compose=1
    printf '%s=%s\n' "$package" "$version"
  done <"$1"
  [[ $seen_docker == 1 && $seen_compose == 1 ]]
}
# END APT PLAN VALIDATOR

# BEGIN LOCAL CONTAINER CHECK
check_local_containers() {
  local containers
  containers=$(timeout 15 docker --host unix:///var/run/docker.sock ps --all --quiet) || return 1
  [[ -z "$containers" ]]
}
# END LOCAL CONTAINER CHECK

stage=website_before
website_snapshot before
stage=apt_update
apt_idle || fail
export DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=l
apt_options=(-o DPkg::Lock::Timeout=0 -o Acquire::Retries=0 -o Acquire::http::Timeout=20 -o Acquire::https::Timeout=20 -o Acquire::AllowInsecureRepositories=false -o Acquire::AllowDowngradeToInsecureRepositories=false -o APT::Get::AllowUnauthenticated=false)
timeout --kill-after=10s 90s apt-get "${apt_options[@]}" update >"$log_dir/apt-update.log" 2>&1
stage=apt_simulation
apt_idle || fail
timeout --kill-after=10s 30s apt-get "${apt_options[@]}" -s --no-install-recommends --no-upgrade install docker.io docker-compose-v2 >"$log_dir/apt-plan.log" 2>&1
validate_apt_plan "$log_dir/apt-plan.log" >"$log_dir/approved-packages.txt" || fail
mapfile -t approved_packages <"$log_dir/approved-packages.txt"
stage=apt_install
apt_idle || fail
timeout --kill-after=10s 240s apt-get "${apt_options[@]}" --assume-yes --no-remove --no-upgrade --no-install-recommends \
  -o Dpkg::Options::=--force-confold install "${approved_packages[@]}" >"$log_dir/apt-install.log" 2>&1

stage=docker_verification
timeout --kill-after=5s 30s systemctl enable --now docker >"$log_dir/docker-start.log" 2>&1
timeout 15 docker --host unix:///var/run/docker.sock version >"$log_dir/docker-version.log" 2>&1
timeout 15 docker --host unix:///var/run/docker.sock compose version >"$log_dir/compose-version.log" 2>&1
docker_version=$(timeout 15 docker --host unix:///var/run/docker.sock version --format '{{.Server.Version}}')
compose_version=$(timeout 15 docker --host unix:///var/run/docker.sock compose version --short)
[[ "$docker_version" =~ ^[0-9]+\.[0-9]+\.[0-9]+[-+~.a-zA-Z0-9]*$ ]] || fail
[[ "$compose_version" =~ ^v?[0-9]+\.[0-9]+\.[0-9]+[-+~.a-zA-Z0-9]*$ ]] || fail
dpkg --compare-versions "${compose_version#v}" ge 2.24.4 || fail
timeout 15 docker --host unix:///var/run/docker.sock info --format '{{.DockerRootDir}}' >"$log_dir/docker-root.log" 2>&1
check_local_containers >"$log_dir/containers.log" 2>&1 || fail
ss -H -ltnp >"$log_dir/listeners.after"
if grep -q '"dockerd"' "$log_dir/listeners.after"; then fail; fi
stage=website_after
website_snapshot after
cmp -s "$log_dir/nginx-before.sha256" "$log_dir/nginx-after.sha256" || fail
cmp -s "$log_dir/http-before.sha256" "$log_dir/http-after.sha256" || fail
printf 'website_http_200_unchanged=true\nnginx_config_hash_unchanged=true\ncontainers=0\ndocker_tcp_listener=false\n' >&3
printf 'DOSO_DOCKER_VERSION=%s\nDOSO_COMPOSE_VERSION=%s\nDOSO_WEBSITE_HTTP_200_UNCHANGED=true\nDOSO_NGINX_CONFIG_HASH_UNCHANGED=true\nDOSO_CONTAINERS=0\nDOSO_DOCKER_TCP_LISTENER=false\n' "$docker_version" "$compose_version"
stage=complete
result=success
reason=none
