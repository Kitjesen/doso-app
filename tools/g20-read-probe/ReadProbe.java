package com.doso.g20.readprobe;

import android.app.Instrumentation;
import android.os.Bundle;
import android.os.SystemClock;
import org.json.JSONArray;
import org.json.JSONObject;
import java.lang.reflect.*;
import java.util.Arrays;
import java.util.concurrent.*;
import java.util.concurrent.atomic.*;

/** Read-only local RC experiment. No SDK bytecode, device writes or robot transport. */
public final class ReadProbe extends Instrumentation {
  private final AtomicBoolean active = new AtomicBoolean(true), completed = new AtomicBoolean(false);
  private final Object lock = new Object();
  private final JSONArray records = new JSONArray();
  private final AtomicInteger sent = new AtomicInteger(), received = new AtomicInteger(), successes = new AtomicInteger();
  private ClassLoader loader;
  private Class<?> sdk;
  private Class<?> scope;
  private Object previousScope;
  private enum Stage { NONE, LOAD_SDK_MANAGER, LOAD_CONNECTION_CALLBACK, LOAD_SCOPE, READ_SCOPE, BUILD_CONNECTION_CALLBACK,
    INIT_SDK, SET_LOG, SET_SCOPE, CONNECT_RC, WAIT_CONNECTION, LOAD_KEYS, LOAD_KEY_MANAGER, LOAD_COMPLETION_CALLBACK,
    READ_KEY, GET, DISCONNECT_RC, RESTORE_SCOPE, PC_STATUS_LOAD, PC_STATUS_SHUTDOWN }
  private volatile Stage stage = Stage.NONE, failureStage = Stage.NONE;
  private volatile String failureClass = "";
  private volatile String mode = "invalid", outcome = "not_started";
  private volatile boolean initialized, raw16;
  private volatile boolean cleanupOk = true;
  private int intervalMs = 20;
  private volatile Runnable pcCleanup;
  private volatile JSONObject pcSummary;
  private long started;
  private final ScheduledExecutorService guard = Executors.newSingleThreadScheduledExecutor();

  @Override public void onCreate(Bundle args) {
    super.onCreate(args);
    started = SystemClock.elapsedRealtimeNanos();
    try {
      for (String key : args.keySet()) if (!key.equals("mode") && !key.equals("raw16") && !key.equals("intervalMs")) throw new IllegalArgumentException();
      String selectedMode = args.getString("mode", "");
      if (!Arrays.asList("channels", "settings", "mode", "pcStatus").contains(selectedMode)) throw new IllegalArgumentException();
      mode = selectedMode;
      if (mode.equals("pcStatus") && (args.containsKey("raw16") || args.containsKey("intervalMs"))) throw new IllegalArgumentException();
      String raw = args.getString("raw16", "false");
      if (!raw.equals("true") && !raw.equals("false")) throw new IllegalArgumentException();
      raw16 = raw.equals("true");
      String interval = args.getString("intervalMs", "20");
      if (!interval.equals("20") && !interval.equals("100")) throw new IllegalArgumentException();
      intervalMs = Integer.parseInt(interval);
    } catch (Throwable error) { finishProbe("invalid_arguments"); return; }
    guard.schedule(() -> finishProbe("outer_deadline"), 10, TimeUnit.SECONDS);
    start();
  }

  private double monoMs() { return (SystemClock.elapsedRealtimeNanos() - started) / 1000000.0; }
  private Object invoke(Class<?> type, String name, Object... args) throws Exception {
    Method selected = null;
    for (Method method : type.getMethods()) if (method.getName().equals(name) && method.getParameterTypes().length == args.length) {
      boolean matches = true;
      Class<?>[] parameters = method.getParameterTypes();
      for (int i = 0; i < parameters.length; i++) {
        Class<?> parameter = parameters[i] == boolean.class ? Boolean.class : parameters[i] == int.class ? Integer.class : parameters[i];
        if (args[i] != null && !parameter.isInstance(args[i])) matches = false;
      }
      if (!matches) continue;
      if (selected != null) throw new IllegalStateException("ambiguous method"); selected = method;
    }
    if (selected == null) throw new NoSuchMethodException();
    Object receiver = Modifier.isStatic(selected.getModifiers()) ? null : type.getField("INSTANCE").get(null);
    return selected.invoke(receiver, args);
  }
  private void failure(Stage failedAt, Throwable error) {
    synchronized (lock) {
      if (failureStage != Stage.NONE) return;
      for (int i = 0; i < 4 && error.getCause() != null; i++) error = error.getCause();
      failureStage = failedAt;
      String name = error.getClass().getName();
      failureClass = name.matches("[A-Za-z_$][A-Za-z0-9_.$]{0,180}") ? name : "unknown";
    }
  }
  private Object proxy(Class<?> type, InvocationHandler handler) {
    return Proxy.newProxyInstance(loader, new Class<?>[] { type }, (object, method, args) -> {
      if (method.getDeclaringClass() == Object.class) {
        if (method.getName().equals("hashCode")) return System.identityHashCode(object);
        if (method.getName().equals("equals")) return object == args[0];
        return "DOSO_READONLY_PROBE";
      }
      return handler.invoke(object, method, args);
    });
  }

  @Override public void onStart() {
    if (mode.equals("pcStatus")) {
      try {
        stage = Stage.PC_STATUS_LOAD;
        PcStatusProbe probe = new PcStatusProbe();
        pcCleanup = probe::close;
        if (!active.get()) { probe.close(); return; }
        pcSummary = probe.run();
        outcome = pcSummary.optBoolean("passed", false) ? "pc_status_complete" : "pc_status_failed";
      } catch (Throwable error) { failure(stage, error); outcome = "pc_status_unavailable"; }
      finally { cleanup(); finishProbe(outcome); }
      return;
    }
    try {
      loader = getTargetContext().getClassLoader();
      stage = Stage.LOAD_SDK_MANAGER;
      sdk = Class.forName("com.skydroid.rcsdk.RCSDKManager", true, loader);
      stage = Stage.LOAD_CONNECTION_CALLBACK;
      Class<?> callback = Class.forName("com.skydroid.rcsdk.SDKManagerCallBack", true, loader);
      stage = Stage.LOAD_SCOPE;
      scope = Class.forName("com.skydroid.rcsdk.internal.InternalKey", true, loader);
      stage = Stage.READ_SCOPE;
      previousScope = invoke(scope, "getOnlyConnect");
      CountDownLatch connected = new CountDownLatch(1);
      AtomicBoolean connectedOk = new AtomicBoolean(false);
      stage = Stage.BUILD_CONNECTION_CALLBACK;
      Object connection = proxy(callback, (object, method, args) -> {
        if (!active.get()) return null;
        if (method.getName().equals("onRcConnected")) { connectedOk.set(true); connected.countDown(); }
        else if (method.getName().equals("onRcConnectFail") || method.getName().equals("onRcDisconnect")) { connectedOk.set(false); connected.countDown(); }
        return null;
      });
      runOnMainSync(() -> {
        if (!active.get()) return;
        try {
          initialized = true;
          stage = Stage.INIT_SDK;
          invoke(sdk, "initSDK", getTargetContext().getApplicationContext(), connection);
          if (!active.get()) return;
          stage = Stage.SET_LOG;
          invoke(sdk, "setLogEnable", false);
          if (!active.get()) return;
          stage = Stage.SET_SCOPE;
          invoke(scope, "setOnlyConnect", scope.getField("ONLY_CONNECT_RC").get(null));
          if (!active.get()) return;
          stage = Stage.CONNECT_RC;
          invoke(sdk, "connectToRC");
        } catch (Throwable error) { failure(stage, error); outcome = "reflection_or_jni_unavailable"; connected.countDown(); }
      });
      stage = Stage.WAIT_CONNECTION;
      if (!connected.await(3, TimeUnit.SECONDS) || !connectedOk.get()) { if (outcome.equals("not_started")) outcome = "connect_unavailable"; return; }
      stage = Stage.LOAD_KEYS;
      Class<?> keys = Class.forName("com.skydroid.rcsdk.key.RemoteControllerKey", true, loader);
      stage = Stage.LOAD_KEY_MANAGER;
      Class<?> manager = Class.forName("com.skydroid.rcsdk.KeyManager", true, loader);
      stage = Stage.LOAD_COMPLETION_CALLBACK;
      Class<?> completion = Class.forName("com.skydroid.rcsdk.common.callback.CompletionCallbackWith", true, loader);
      String keyName = mode.equals("channels") ? "KeyChannels" : mode.equals("settings") ? "KeyChannelSettings" : "KeyControlMode";
      stage = Stage.READ_KEY;
      Object key = invoke(keys, "get" + keyName);
      long end = SystemClock.elapsedRealtime() + 3000, last = 0;
      outcome = "completed_window";
      while (active.get() && SystemClock.elapsedRealtime() < end && received.get() < 160) {
        long remaining = intervalMs - (SystemClock.elapsedRealtime() - last);
        if (remaining > 0) Thread.sleep(remaining);
        if (!active.get() || SystemClock.elapsedRealtime() >= end) break;
        AtomicBoolean pending = new AtomicBoolean(true);
        CountDownLatch done = new CountDownLatch(1);
        final double requestedAt = monoMs();
        final int number = sent.incrementAndGet();
        Object result = proxy(completion, (object, method, values) -> {
          String name = method.getName();
          if (!name.equals("onSuccess") && !name.equals("onFailure")) return null;
          if (!active.get() || !pending.compareAndSet(true, false)) return null;
          synchronized (lock) {
            if (active.get() && received.get() < 160) {
              JSONObject row = new JSONObject(); row.put("sequence", number); row.put("requestMonoMs", requestedAt);
              row.put("callbackMonoMs", monoMs()); row.put("durationMs", monoMs() - requestedAt);
              row.put("success", name.equals("onSuccess"));
              if (name.equals("onSuccess")) successes.incrementAndGet();
              if (raw16 && mode.equals("channels") && values != null && values.length > 0 && values[0] instanceof int[]) {
                int[] channels = (int[]) values[0]; JSONArray raw = new JSONArray();
                for (int i = 0; i < Math.min(16, channels.length); i++) raw.put(channels[i]);
                row.put("raw16", raw);
              }
              records.put(row); received.incrementAndGet();
            }
          }
          done.countDown(); return null;
        });
        last = SystemClock.elapsedRealtime();
        stage = Stage.GET;
        invoke(manager, "get", key, result);
        if (!done.await(500, TimeUnit.MILLISECONDS)) {
          pending.set(false); outcome = "get_timeout"; break;
        }
      }
    } catch (Throwable error) { failure(stage, error); outcome = "reflection_or_jni_unavailable"; }
    finally { cleanup(); finishProbe(outcome); }
  }

  private synchronized void cleanup() {
    active.set(false);
    Runnable shutdownPc = pcCleanup; pcCleanup = null;
    try { if (shutdownPc != null) shutdownPc.run(); }
    catch (Throwable error) { cleanupOk = false; failure(Stage.PC_STATUS_SHUTDOWN, error); }
    try { if (initialized && sdk != null) invoke(sdk, "disconnectRC"); }
    catch (Throwable error) { cleanupOk = false; failure(Stage.DISCONNECT_RC, error); }
    finally {
      Class<?> restoreScope = scope; Object restoreValue = previousScope;
      scope = null; previousScope = null;
      try { if (restoreScope != null && restoreValue != null) invoke(restoreScope, "setOnlyConnect", restoreValue); }
      catch (Throwable error) { cleanupOk = false; failure(Stage.RESTORE_SCOPE, error); }
      initialized = false;
    }
  }
  private void finishProbe(String requestedOutcome) {
    if (!completed.compareAndSet(false, true)) return;
    cleanup(); guard.shutdownNow();
    Bundle output = new Bundle();
    String finalOutcome = requestedOutcome;
    boolean passed = false;
    try {
      JSONObject summary = new JSONObject();
      synchronized (lock) {
        if (mode.equals("pcStatus")) {
          if (pcSummary != null) summary = pcSummary;
          passed = finalOutcome.equals("pc_status_complete") && cleanupOk && pcSummary != null && pcSummary.optBoolean("passed", false);
          summary.put("identity", "DOSO_READONLY_PC_STATUS_PROBE"); summary.put("mode", "pcStatus");
          summary.put("outcome", finalOutcome); summary.put("passed", passed); summary.put("cleanupOk", cleanupOk);
          summary.put("failureStage", failureStage.name());
          if (!failureClass.isEmpty()) summary.put("failureClass", failureClass);
        } else {
        int failedCallbacks = received.get() - successes.get();
        if (finalOutcome.equals("completed_window") && successes.get() == 0) finalOutcome = "no_successful_callbacks";
        else if (finalOutcome.equals("completed_window") && failedCallbacks > 0) finalOutcome = "partial_callbacks";
        passed = finalOutcome.equals("completed_window") && cleanupOk && successes.get() > 0 && failedCallbacks == 0;
        summary.put("identity", "DOSO_READONLY_G20_PROBE"); summary.put("mode", mode); summary.put("outcome", finalOutcome);
        summary.put("sent", sent.get()); summary.put("responses", received.get()); summary.put("successes", successes.get());
        summary.put("failedCallbacks", failedCallbacks); summary.put("passed", passed);
        summary.put("cleanupOk", cleanupOk); summary.put("durationMs", monoMs()); summary.put("targetIntervalMs", intervalMs);
        summary.put("failureStage", failureStage.name()); summary.put("failureClass", failureClass);
        summary.put("maximumResponses", 160); summary.put("records", records);
        summary.put("scope", "local SDK GET callbacks only; no SET/ACTION/robot; target rate is not a measured pass");
        }
      }
      output.putString("stream", summary.toString() + "\n");
    } catch (Throwable error) { passed = false; output.putString("stream", "{\"identity\":\"DOSO_READONLY_G20_PROBE\",\"outcome\":\"summary_failed\"}\n"); }
    finish(passed ? -1 : 0, output);
  }
  @Override public void onDestroy() { finishProbe("lifecycle_destroyed"); cleanup(); super.onDestroy(); }
}
