import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
const code=ts.transpileModule(readFileSync(new URL('../src/services/authSessionIdentity.ts',import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const exports={};
// Expo installs TextDecoder; Hermes has no browser atob/Buffer globals.
vm.runInNewContext(code,{exports,TextDecoder,Uint8Array});
const sessionId='66666666-6666-4666-8666-666666666666';
const userId='55555555-5555-4555-8555-555555555555';
const token=payload=>`e30.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.fixture`;
test('valid session identity is readable in a native runtime without atob or Buffer',()=>{
  const actual=exports.readAuthSessionIdentity({user:{id:userId},access_token:token({session_id:sessionId,name:'森哥 · DOSO 🚀'})});
  assert.equal(actual?.sessionId,sessionId);assert.equal(actual?.userId,userId);
});
test('native decoder preserves fail-closed behavior for malformed payloads and missing session identity',()=>{
  for(const value of [null,'','a.b.c','a.%xx.c','a.A===.c','a.!!!!.c',token({}),token({session_id:'invalid'}),'a.'+'A'.repeat(32769)+'.c'])assert.equal(exports.parseAuthSessionId(value),null);
});
test('native decoding matches browser base64url decoding across UTF8 and padding lengths',()=>{
  for(let size=0;size<100;size++){
    const payload=Buffer.from(JSON.stringify({session_id:sessionId,extra:'中🙂'.repeat(size)}));
    for(const encoded of [payload.toString('base64url'),payload.toString('base64').replace(/\+/g,'-').replace(/\//g,'_')])assert.equal(exports.parseAuthSessionId(`e30.${encoded}.fixture`),sessionId);
  }
});
