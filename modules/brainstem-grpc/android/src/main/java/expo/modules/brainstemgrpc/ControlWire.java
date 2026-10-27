package expo.modules.brainstemgrpc;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Map;

/** Small bounded codec for cms.proto control messages. Lease credentials never cross the bridge. */
public final class ControlWire {
  private ControlWire() {}
  public static final class Lease {
    public final boolean accepted;
    public final String token;
    public final int durationMs;
    public final int reason;
    public final Map<String, Object> status;
    Lease(boolean accepted, String token, int durationMs, int reason, Map<String, Object> status) {
      this.accepted = accepted; this.token = token; this.durationMs = durationMs;
      this.reason = reason; this.status = status;
    }
  }
  public static final class Ack {
    public final boolean accepted;
    public final int reason;
    public final long sequence;
    public final Map<String, Object> status;
    Ack(boolean accepted, int reason, long sequence, Map<String, Object> status) {
      this.accepted = accepted; this.reason = reason; this.sequence = sequence; this.status = status;
    }
  }
  public static byte[] stringRequest(String value) {
    byte[] text = value.getBytes(StandardCharsets.UTF_8);
    if (text.length == 0 || text.length > 4096) throw new IllegalArgumentException("Invalid control value");
    ByteArrayOutputStream out = new ByteArrayOutputStream();
    varint(out, 10); varint(out, text.length); out.write(text, 0, text.length);
    return out.toByteArray();
  }
  public static byte[] walk(String token, long sequence, double x, double y, double z) {
    if (sequence <= 0 || !Double.isFinite(x) || !Double.isFinite(y) || !Double.isFinite(z)
        || Math.abs(x) > 0.3 || Math.abs(y) > 0.3 || Math.abs(z) > 0.5) {
      throw new IllegalArgumentException("Invalid control input");
    }
    ByteArrayOutputStream out = new ByteArrayOutputStream();
    byte[] encodedToken = stringRequest(token);
    out.write(encodedToken, 0, encodedToken.length);
    varint(out, 16); varint(out, sequence);
    ByteArrayOutputStream vector = new ByteArrayOutputStream();
    for (int i = 0; i < 3; i++) {
      varint(vector, ((i + 1) << 3) | 1);
      byte[] value = ByteBuffer.allocate(8).order(ByteOrder.LITTLE_ENDIAN).putDouble(i == 0 ? x : i == 1 ? y : z).array();
      vector.write(value, 0, value.length);
    }
    byte[] body = vector.toByteArray();
    varint(out, 26); varint(out, body.length); out.write(body, 0, body.length);
    return out.toByteArray();
  }
  public static Lease lease(byte[] bytes) throws IOException {
    Reader r = new Reader(bytes);
    boolean accepted = false; String token = ""; int duration = 0, reason = 0, seen = 0;
    Map<String, Object> status = null;
    while (r.hasNext()) {
      int tag = r.tag(), field = tag >>> 3, wire = tag & 7;
      if (field <= 5) { int bit = 1 << field; if ((seen & bit) != 0) throw invalid(); seen |= bit; }
      switch (field) {
        case 1: r.wire(wire, 0); accepted = r.bool(); break;
        case 2: r.wire(wire, 2); token = r.text(4096); break;
        case 3: r.wire(wire, 0); duration = r.small(60000); break;
        case 4: r.wire(wire, 0); reason = r.small(9); break;
        case 5: r.wire(wire, 2); status = ControlStatusParser.parse(r.data()); break;
        default: r.skip(wire);
      }
    }
    if (status == null || (accepted && (token.isEmpty() || duration < 200 || reason != 0))) throw invalid();
    return new Lease(accepted, token, duration, reason, status);
  }
  public static Ack ack(byte[] bytes) throws IOException {
    Reader r = new Reader(bytes);
    boolean accepted = false; int reason = 0, seen = 0; long sequence = 0;
    Map<String, Object> status = null;
    while (r.hasNext()) {
      int tag = r.tag(), field = tag >>> 3, wire = tag & 7;
      if (field <= 4) { int bit = 1 << field; if ((seen & bit) != 0) throw invalid(); seen |= bit; }
      switch (field) {
        case 1: r.wire(wire, 0); accepted = r.bool(); break;
        case 2: r.wire(wire, 0); reason = r.small(9); break;
        case 3: r.wire(wire, 0); sequence = r.varint(); if (sequence < 0) throw invalid(); break;
        case 4: r.wire(wire, 2); status = ControlStatusParser.parse(r.data()); break;
        default: r.skip(wire);
      }
    }
    if (status == null || (accepted && (sequence == 0 || reason != 0))) throw invalid();
    return new Ack(accepted, reason, sequence, status);
  }
  public static void requireLeaseOwner(byte[] bytes, String principal, long expectedSequence) throws IOException {
    Reader r = new Reader(bytes); String owner = ""; long last = 0; int seen = 0;
    while (r.hasNext()) {
      int tag = r.tag(), field = tag >>> 3, wire = tag & 7;
      if (field == 10) { if ((seen & 1) != 0) throw invalid(); seen |= 1; r.wire(wire, 2); owner = r.text(256); }
      else if (field == 7) { if ((seen & 2) != 0) throw invalid(); seen |= 2; r.wire(wire, 0); last = r.varint(); }
      else r.skip(wire);
    }
    if (!principal.equals(owner) || last < 0 || last != expectedSequence) throw invalid();
  }
  public static byte[] nestedStatus(byte[] bytes, int statusField) throws IOException {
    Reader r = new Reader(bytes); byte[] result = null;
    while (r.hasNext()) { int tag = r.tag(); if ((tag >>> 3) == statusField) {
      if (result != null) throw invalid(); r.wire(tag & 7, 2); result = r.data();
    } else r.skip(tag & 7); }
    if (result == null) throw invalid(); return result;
  }
  private static void varint(ByteArrayOutputStream out, long value) {
    while ((value & ~127L) != 0) { out.write(((int)value & 127) | 128); value >>>= 7; }
    out.write((int)value);
  }
  private static IOException invalid() { return new IOException("Invalid control response"); }
  private static final class Reader {
    final byte[] bytes; int pos = 0;
    Reader(byte[] bytes) throws IOException { if (bytes == null || bytes.length > ControlStatusParser.MAX_BYTES) throw invalid(); this.bytes = bytes; }
    boolean hasNext() { return pos < bytes.length; }
    void wire(int actual, int expected) throws IOException { if (actual != expected) throw invalid(); }
    long varint() throws IOException {
      long result = 0;
      for (int i = 0; i < 10; i++) { if (pos >= bytes.length) throw invalid(); int b = bytes[pos++] & 255;
        if (i == 9 && b > 1) throw invalid(); result |= (long)(b & 127) << (7 * i); if ((b & 128) == 0) return result; }
      throw invalid();
    }
    int small(int max) throws IOException { long value = varint(); if (value < 0 || value > max) throw invalid(); return (int)value; }
    int tag() throws IOException { long v = varint(); if (v < 8 || v > 0xffffffffL || (v >>> 3) > 0x1fffffffL) throw invalid(); return (int)v; }
    boolean bool() throws IOException { return small(1) == 1; }
    byte[] data() throws IOException { int length = small(ControlStatusParser.MAX_BYTES); if (length > bytes.length - pos) throw invalid(); byte[] value = Arrays.copyOfRange(bytes,pos,pos+length); pos += length; return value; }
    String text(int max) throws IOException {
      byte[] value = data(); if (value.length > max) throw invalid();
      return StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT)
        .onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(value)).toString();
    }
    void skip(int wire) throws IOException {
      if (wire == 0) varint(); else if (wire == 2) data(); else if (wire == 1 || wire == 5) {
        int length = wire == 1 ? 8 : 4; if (length > bytes.length - pos) throw invalid(); pos += length;
      } else throw invalid();
    }
  }
}
