import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const source = readFileSync(path.join(root, 'ReadProbe.java'), 'utf8');
const pcSource = readFileSync(path.join(root, 'PcStatusProbe.java'), 'utf8');
const pcPure = pcSource.slice(pcSource.indexOf('static byte[] readBounded('), pcSource.indexOf('JSONObject run()'));
assert.match(pcSource, /forAddress\("127\.0\.0\.1", 19146\)/);
assert.match(pcSource, /setFullMethodName\("brainstem\.api\.v1\.RobotControl\/GetControlStatus"\)/);
assert.match(pcSource, /withDeadlineAfter\(3, TimeUnit.SECONDS\)/);
assert.match(pcSource, /done\.await\(3, TimeUnit.SECONDS\)/);
assert.match(pcSource, /finally \{ close\(\); \}/);
const methodStart = source.indexOf('private synchronized void cleanup()');
const methodEnd = source.indexOf('private void finishProbe(', methodStart);
const cleanup = source.slice(methodStart, methodEnd);
const invocation = source.slice(source.indexOf('private Object invoke('), source.indexOf('private void failure('));
const callback = source.slice(source.indexOf('String name = method.getName();'), source.indexOf('synchronized (lock) {', source.indexOf('String name = method.getName();')));
assert.ok(callback.indexOf('!name.equals("onSuccess")') < callback.indexOf('pending.compareAndSet'));
assert.match(source, /finishProbe\("outer_deadline"\)/);
assert.match(source, /finishProbe\("lifecycle_destroyed"\)/);
assert.match(source, /finish\(passed \? -1 : 0, output\)/);
assert.match(source, /long remaining = intervalMs -/);
assert.match(source, /String interval = args\.getString\("intervalMs", "20"\)/);
assert.match(source, /if \(!interval\.equals\("20"\) && !interval\.equals\("100"\)\) throw new IllegalArgumentException\(\)/);
const pendingWait = source.match(/done\.await\(([^;\n]+?)\)\) \{/);
assert.equal(pendingWait?.[1], '500, TimeUnit.MILLISECONDS');
assert.match(source, /invoke\(scope, "getOnlyConnect"\)/);
assert.match(source, /invoke\(keys, "get" \+ keyName\)/);
assert.match(source, /type\.getField\("INSTANCE"\)\.get\(null\)/);
assert.match(source, /passed = finalOutcome\.equals\("completed_window"\) && cleanupOk && successes\.get\(\) > 0 && failedCallbacks == 0/);

const build = path.join(root, 'build', 'selfcheck');
mkdirSync(build, { recursive: true });
const host = `import java.lang.reflect.*; import java.util.concurrent.*; import java.util.concurrent.atomic.*; import java.io.*; import java.util.Locale;
public class CleanupSelfCheck {
  AtomicBoolean active = new AtomicBoolean(true); boolean initialized = true, cleanupOk = true;
  Class<?> sdk = Object.class, scope; Object previousScope; boolean disconnectFails; int disconnects;
  Runnable pcCleanup;
  enum Stage { DISCONNECT_RC, RESTORE_SCOPE, PC_STATUS_SHUTDOWN }
  Stage failureStage;
  void failure(Stage stage, Throwable error) { if (failureStage == null) failureStage = stage; }
  static int onlyConnect = 1;
  Object invoke(Class<?> type, String method, Object... args) {
    if (method.equals("setOnlyConnect")) { onlyConnect = (Integer)args[0]; return null; }
    disconnects++; if (disconnectFails) throw new RuntimeException(); return null;
  }
  ${cleanup}
  static boolean callback(String name, AtomicBoolean pending, AtomicBoolean active) {
    if (!name.equals("onSuccess") && !name.equals("onFailure")) return false;
    return active.get() && pending.compareAndSet(true, false);
  }
  static boolean passed(String outcome, boolean cleanup, int success, int failed) {
    return outcome.equals("completed_window") && cleanup && success > 0 && failed == 0;
  }
  public static void main(String[] args) throws Exception {
    InstanceInvokeSelfCheck.check();
    PcPureSelfCheck.check();
    CountDownLatch done = new CountDownLatch(1);
    long requestWindowEnd = System.nanoTime() - 1000000;
    Thread lastResponse = new Thread(() -> { try { Thread.sleep(30); done.countDown(); } catch (InterruptedException error) { throw new RuntimeException(error); } });
    lastResponse.start();
    assert System.nanoTime() > requestWindowEnd;
    assert done.await(${pendingWait[1]});
    lastResponse.join();
    CleanupSelfCheck fail = new CleanupSelfCheck(); fail.disconnectFails = true;
    fail.scope = CleanupSelfCheck.class; fail.previousScope = 7;
    fail.cleanup(); fail.cleanup();
    assert !fail.cleanupOk && !fail.active.get() && !fail.initialized && fail.disconnects == 1;
    assert onlyConnect == 7 && fail.scope == null && fail.previousScope == null;
    assert fail.failureStage == Stage.DISCONNECT_RC;
    CleanupSelfCheck ok = new CleanupSelfCheck();
    Thread a = new Thread(ok::cleanup), b = new Thread(ok::cleanup); a.start(); b.start(); a.join(); b.join();
    assert ok.cleanupOk && ok.disconnects == 1 && !ok.active.get();
    AtomicBoolean pending = new AtomicBoolean(true), active = new AtomicBoolean(true);
    assert !callback("unexpected", pending, active) && pending.get();
    assert callback("onSuccess", pending, active) && !callback("onFailure", pending, active);
    pending.set(true); active.set(false); assert !callback("onSuccess", pending, active) && pending.get();
    assert !passed("completed_window", true, 0, 0);
    assert !passed("completed_window", true, 2, 1);
    assert !passed("completed_window", false, 2, 0);
    assert !passed("outer_deadline", true, 2, 0);
    assert passed("completed_window", true, 2, 0);
    System.out.println("probe host self-check passed: sticky cleanup, concurrent cleanup, scope restoration, callback isolation, completion predicates, in-flight GET after request window");
  }
}
class InstanceInvokeSelfCheck {
  ${invocation}
  public static class Singleton {
    public static final Singleton INSTANCE = new Singleton();
    int scope = 3; boolean log;
    public int getOnlyConnect() { return scope; }
    public void setOnlyConnect(int value) { scope = value; }
    public void setLogEnable(boolean value) { log = value; }
    public Object getKeyChannels() { return this; }
    public static String staticCheck() { return "static"; }
  }
  static void check() throws Exception {
    InstanceInvokeSelfCheck check = new InstanceInvokeSelfCheck();
    assert check.invoke(Singleton.class, "getOnlyConnect").equals(3);
    check.invoke(Singleton.class, "setOnlyConnect", 8);
    check.invoke(Singleton.class, "setLogEnable", true);
    assert Singleton.INSTANCE.scope == 8 && Singleton.INSTANCE.log;
    assert check.invoke(Singleton.class, "getKeyChannels") == Singleton.INSTANCE;
    assert check.invoke(Singleton.class, "staticCheck").equals("static");
  }
}
class PcPureSelfCheck {
  ${pcPure}
  static void check() throws Exception {
    assert readBounded(new ByteArrayInputStream(new byte[65536])).length == 65536;
    boolean rejected = false;
    try { readBounded(new ByteArrayInputStream(new byte[65537])); } catch(IOException expected) { rejected = true; }
    assert rejected;
    assert classify(null).equals("none");
    assert classify("private arbitrary description").equals("other");
    assert classify("CLEARTEXT transport denied").equals("cleartext");
    assert classify("HTTP2 preface error").equals("preface");
    assert classify("name resolution failed").equals("name_resolution");
    assert classify("Connection refused").equals("connection_refused");
    assert classify("Connection reset").equals("connection_reset");
    assert classify("deadline exceeded").equals("timeout");
    assert classify("SSL certificate").equals("tls");
  }
}`;
writeFileSync(path.join(build, 'CleanupSelfCheck.java'), host);
const javaBin = 'D:/Android/Android Studio/jbr/bin';
execFileSync(path.join(javaBin, 'javac.exe'), ['-d', build, path.join(build, 'CleanupSelfCheck.java')], { stdio: 'pipe' });
process.stdout.write(execFileSync(path.join(javaBin, 'java.exe'), ['-ea', '-cp', build, 'CleanupSelfCheck'], { encoding: 'utf8' }));
