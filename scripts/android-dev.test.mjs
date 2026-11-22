import test from 'node:test';
import assert from 'node:assert/strict';
import {debugCommand} from './android-dev.mjs';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
test('development build is incremental debug and does not bundle QA JavaScript',()=>{
 const root=fileURLToPath(new URL('../',import.meta.url));
 const c=debugCommand(root,{JAVA_HOME:'D:/Android/Android Studio/jbr'});
 assert.ok(c.args.includes(':app:assembleDebug'));
 assert.ok(!c.args.some(x=>/assembleQa|createBundle|--rerun|--no-build-cache/.test(x)));
 assert.ok(c.args.includes('--max-workers=2'));
 assert.equal(c.options.shell,false);
});
test('debug app is isolated from installed QA and release package identities',()=>{
 const s=readFileSync(new URL('../android/app/build.gradle',import.meta.url),'utf8');
 assert.match(s,/debug\s*\{\s*signingConfig signingConfigs\.debug\s*applicationIdSuffix "\.dev"\s*resValue "string", "app_name", "DOSO Dev"/);
 assert.match(s,/qa\s*\{\s*initWith release\s*applicationIdSuffix "\.qa"/);
});
