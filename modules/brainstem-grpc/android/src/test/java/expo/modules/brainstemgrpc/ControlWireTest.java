package expo.modules.brainstemgrpc;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.Arrays;

public final class ControlWireTest {
  static byte[] join(byte[]... values) {
    ByteArrayOutputStream out = new ByteArrayOutputStream();
    for (byte[] value : values) out.write(value, 0, value.length);
    return out.toByteArray();
  }
  static byte[] v(long value) {
    ByteArrayOutputStream out = new ByteArrayOutputStream();
    while ((value & ~127L) != 0) { out.write(((int)value & 127) | 128); value >>>= 7; }
    out.write((int)value); return out.toByteArray();
  }
  static byte[] f(int field, long value) { return join(v(field << 3), v(value)); }
  static byte[] b(int field, byte[] value) { return join(v((field << 3) | 2), v(value.length), value); }
  static byte[] text(int field, String value) { return b(field, value.getBytes(java.nio.charset.StandardCharsets.UTF_8)); }
  static byte[] status(long sequence) {
    return join(b(1, f(1, 2)), f(2, 1), f(3, 1), f(5, 1), f(7, sequence), text(10, "doso-g20@robot"));
  }
  static void fail(Throwing action) throws Exception {
    try { action.run(); } catch (IOException | IllegalArgumentException expected) { return; }
    throw new AssertionError("Expected rejection");
  }
  interface Throwing { void run() throws Exception; }
  public static void main(String[] args) throws Exception {
    byte[] state = status(1);
    byte[] lease = join(f(1, 1), text(2, "ephemeral-test-lease"), f(3, 500), b(5, status(0)));
    ControlWire.Lease parsed = ControlWire.lease(lease);
    if (!parsed.accepted || parsed.durationMs != 500 || parsed.status.containsKey("owner_id")) throw new AssertionError();
    byte[] ack = join(f(1, 1), f(3, 1), b(4, state));
    if (!ControlWire.ack(ack).accepted || ControlWire.ack(ack).sequence != 1) throw new AssertionError();
    ControlWire.requireLeaseOwner(state, "doso-g20@robot", 1);
    fail(() -> ControlWire.requireLeaseOwner(state, "other@robot", 1));
    fail(() -> ControlWire.requireLeaseOwner(state, "doso-g20@robot", 2));
    fail(() -> ControlWire.lease(join(f(1, 1), f(3, 500), b(5, state))));
    fail(() -> ControlWire.lease(join(lease, f(1, 1))));
    fail(() -> ControlWire.lease(join(f(1, 1), text(2, "x"), f(3, 100), b(5, state))));
    fail(() -> ControlWire.ack(join(f(1, 1), f(2, 1), f(3, 1), b(4, state))));
    fail(() -> ControlWire.ack(join(f(1, 1), b(4, state))));
    fail(() -> ControlWire.ack(join(ack, f(3, 2))));
    fail(() -> ControlWire.nestedStatus(join(ack, b(4, state)), 4));
    fail(() -> ControlWire.ack(new byte[]{(byte)0x80}));
    fail(() -> ControlWire.lease(new byte[ControlStatusParser.MAX_BYTES + 1]));
    fail(() -> ControlWire.stringRequest(""));
    fail(() -> ControlWire.walk("x", 0, 0, 0, 0));
    fail(() -> ControlWire.walk("x", 1, Double.NaN, 0, 0));
    fail(() -> ControlWire.walk("x", 1, .31, 0, 0));
    fail(() -> ControlWire.walk("x", 1, 0, 0, .51));
    byte[] walk = ControlWire.walk("token", 300, .2, -.1, .3);
    byte[] vector = join(new byte[]{9}, ByteBuffer.allocate(8).order(ByteOrder.LITTLE_ENDIAN).putDouble(.2).array(),
      new byte[]{17}, ByteBuffer.allocate(8).order(ByteOrder.LITTLE_ENDIAN).putDouble(-.1).array(),
      new byte[]{25}, ByteBuffer.allocate(8).order(ByteOrder.LITTLE_ENDIAN).putDouble(.3).array());
    if (!Arrays.equals(walk, join(text(1, "token"), f(2, 300), b(3, vector)))) throw new AssertionError("wire mismatch");
    System.out.println("PASS: control wire, lease/ACK validation, owner/sequence, bounded malformed inputs");
  }
}
