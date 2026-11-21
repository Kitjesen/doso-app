import assert from 'node:assert/strict';
import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url)), previous = resolve(here, '../simulated-device-20261107');
const root = resolve(here, '../../..');
const hashes = async dir => Object.fromEntries(await Promise.all((await readdir(dir, {recursive:true,withFileTypes:true})).filter(p=>p.isFile()).map(async p=>{
  assert(!p.isSymbolicLink());const file=resolve(p.parentPath,p.name);return [relative(dir,file).replaceAll('\\','/'),createHash('sha256').update(await readFile(file)).digest('hex')];
})));
await cp(resolve(previous,'functions'),resolve(here,'functions'),{recursive:true});
await writeFile(resolve(here,'baseline.json'),JSON.stringify(await hashes(resolve(previous,'functions')),null,2));
for(const name of ['remote-state']) await cp(resolve(root,'supabase/functions',name,'handler.ts'),resolve(here,'functions',name,'handler.ts'));
for(const file of ['runtime_base.py','database_base.py']) await cp(resolve(previous,file),resolve(here,file));
await mkdir(resolve(here,'sql'),{recursive:true});
await cp(resolve(root,'supabase/migrations/20261108010000_add_remote_location.sql'),resolve(here,'sql/20261108010000_add_remote_location.sql'));
const validation=await readFile(resolve(root,'supabase/verification/local/remote_location.test.sql'),'utf8');
assert(validation.includes('do $$'));
await writeFile(resolve(here,'sql/postflight.sql'),"\\set ON_ERROR_STOP on\n"+validation.slice(validation.indexOf('do $$'))+"\n\\echo PASS device_location_readonly_postflight\n");
const before=await hashes(resolve(previous,'functions')),after=await hashes(resolve(here,'functions'));
assert.deepEqual(Object.keys(after).sort(),Object.keys(before).sort());
assert.deepEqual(Object.keys(after).filter(p=>after[p]!==before[p]).sort(),['remote-state/handler.ts']);
await writeFile(resolve(here,'compose.device-location.yml'),`# Append as layer 15; change only the functions source mount.
services:
  functions:
    volumes: !override
      - type: bind
        source: ./doso/device-location-20261108/functions
        target: /home/deno/functions
        read_only: true
        bind: {create_host_path: false}
      - type: volume
        source: deno-cache
        target: /root/.cache/deno
`);
const files=['deploy_test.py','deploy.py','runtime_base.py','database_base.py','baseline.json','compose.device-location.yml','README.md'];
for(const dir of ['functions','sql'])for(const p of await readdir(resolve(here,dir),{recursive:true,withFileTypes:true}))if(p.isFile())files.push(relative(here,resolve(p.parentPath,p.name)).replaceAll('\\','/'));
assert(!files.some(p=>/\.(pem|key|env)$/.test(p)));
const result=spawnSync('tar',['-czf','device-location-20261108.tar.gz',...files],{cwd:here,encoding:'utf8'});
assert.equal(result.status,0,result.stderr);
console.log(JSON.stringify({status:'packaged',files:files.length,changedHandlers:['remote-state']}));

