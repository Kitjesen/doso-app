package com.doso.g20.readprobe;

import io.grpc.CallOptions;
import io.grpc.ClientCall;
import io.grpc.ManagedChannel;
import io.grpc.Metadata;
import io.grpc.MethodDescriptor;
import io.grpc.Status;
import io.grpc.okhttp.OkHttpChannelBuilder;
import java.io.*;
import java.util.Locale;
import java.util.concurrent.*;
import java.util.concurrent.atomic.*;
import org.json.JSONObject;

/** One fixed loopback status GET; dependencies are supplied by the target APK. */
final class PcStatusProbe implements AutoCloseable {
  private final AtomicBoolean closed = new AtomicBoolean(false);
  private ManagedChannel channel;
  private ClientCall<byte[], byte[]> call;

  static byte[] readBounded(InputStream input) throws IOException {
    ByteArrayOutputStream output = new ByteArrayOutputStream();
    byte[] buffer = new byte[4096];
    for (int size; (size = input.read(buffer)) != -1;) {
      if (output.size() + size > 65536) throw new IOException();
      output.write(buffer, 0, size);
    }
    return output.toByteArray();
  }
  static String classify(String description) {
    if (description == null || description.isEmpty()) return "none";
    String text = description.toLowerCase(Locale.ROOT);
    if (text.contains("cleartext")) return "cleartext";
    if (text.contains("preface")) return "preface";
    if (text.contains("resolve") || text.contains("resolution")) return "name_resolution";
    if (text.contains("refused")) return "connection_refused";
    if (text.contains("reset")) return "connection_reset";
    if (text.contains("timeout") || text.contains("deadline")) return "timeout";
    if (text.contains("ssl") || text.contains("tls") || text.contains("certificate")) return "tls";
    return "other";
  }
  JSONObject run() throws Exception {
    Status result = Status.UNKNOWN;
    Throwable failure = null;
    AtomicInteger bodyBytes = new AtomicInteger(-1);
    AtomicBoolean duplicate = new AtomicBoolean(false);
    CountDownLatch done = new CountDownLatch(1);
    AtomicReference<Status> observed = new AtomicReference<>();
    try {
      if (closed.get()) throw Status.CANCELLED.asRuntimeException();
      ManagedChannel built = OkHttpChannelBuilder.forAddress("127.0.0.1", 19146).usePlaintext()
        .maxInboundMessageSize(65536).maxInboundMetadataSize(8192).disableRetry().build();
      synchronized (this) {
        if (closed.get()) { built.shutdownNow(); throw Status.CANCELLED.asRuntimeException(); }
        channel = built;
      }
      MethodDescriptor.Marshaller<byte[]> marshaller = new MethodDescriptor.Marshaller<byte[]>() {
        public InputStream stream(byte[] bytes) { return new ByteArrayInputStream(bytes); }
        public byte[] parse(InputStream input) {
          try { return readBounded(input); } catch (IOException error) { throw Status.RESOURCE_EXHAUSTED.withCause(error).asRuntimeException(); }
        }
      };
      MethodDescriptor<byte[], byte[]> method = MethodDescriptor.<byte[], byte[]>newBuilder()
        .setType(MethodDescriptor.MethodType.UNARY)
        .setFullMethodName("brainstem.api.v1.RobotControl/GetControlStatus")
        .setRequestMarshaller(marshaller).setResponseMarshaller(marshaller).build();
      ClientCall<byte[], byte[]> next = built.newCall(method, CallOptions.DEFAULT.withDeadlineAfter(3, TimeUnit.SECONDS));
      synchronized (this) {
        if (closed.get()) { next.cancel("Read-only probe closed", null); throw Status.CANCELLED.asRuntimeException(); }
        call = next;
      }
      next.start(new ClientCall.Listener<byte[]>() {
        @Override public void onMessage(byte[] bytes) {
          if (closed.get()) return;
          if (!bodyBytes.compareAndSet(-1, bytes.length)) duplicate.set(true);
        }
        @Override public void onClose(Status status, Metadata trailers) {
          if (closed.get()) return;
          observed.set(status); done.countDown();
        }
      }, new Metadata());
      next.request(2); next.sendMessage(new byte[0]); next.halfClose();
      if (!done.await(3, TimeUnit.SECONDS)) result = Status.DEADLINE_EXCEEDED;
      else result = observed.get();
      if (result.isOk() && (duplicate.get() || bodyBytes.get() < 0)) result = Status.DATA_LOSS;
    } catch (Throwable error) { failure = error; result = Status.fromThrowable(error); }
    finally { close(); }
    JSONObject summary = new JSONObject();
    summary.put("identity", "DOSO_READONLY_PC_STATUS_PROBE"); summary.put("mode", "pcStatus");
    summary.put("passed", result.isOk()); summary.put("grpcCode", result.getCode().name());
    if (result.isOk()) summary.put("bodyBytes", bodyBytes.get());
    else {
      Throwable cause = failure != null ? failure : result.getCause();
      String category = classify(result.getDescription());
      for (int i = 0; cause != null && i < 4; i++) {
        if (category.equals("none") || category.equals("other")) category = classify(cause.getMessage());
        if (cause.getCause() == null) break;
        cause = cause.getCause();
      }
      summary.put("failureClass", cause == null ? "none" : cause.getClass().getName());
      summary.put("descriptionCategory", category);
    }
    return summary;
  }
  @Override public synchronized void close() {
    if (!closed.compareAndSet(false, true)) return;
    try { if (call != null) call.cancel("Read-only probe finished", null); }
    finally { if (channel != null) channel.shutdownNow(); call = null; channel = null; }
  }
}
