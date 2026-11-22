package expo.modules.brainstemgrpc;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.Map;

/** Standalone JVM tests run by scripts/brainstem-grpc-native.test.mjs; no Android runtime. */
public final class ImuParserTest {
  private static void check(boolean value) { if (!value) throw new AssertionError("fixture mismatch"); }
  private static void varint(ByteArrayOutputStream out, long value) {
    while ((value & ~0x7FL) != 0) {
      out.write((int) ((value & 0x7F) | 0x80));
      value >>>= 7;
    }
    out.write((int) value);
  }
  private static void field(ByteArrayOutputStream out, int number, int wire, byte[] payload) {
    varint(out, (number << 3) | wire);
    if (wire == 2) varint(out, payload.length);
    out.write(payload, 0, payload.length);
  }
  private static byte[] fixed64(double value) {
    byte[] out = new byte[8];
    ByteBuffer.wrap(out).order(ByteOrder.LITTLE_ENDIAN).putDouble(value);
    return out;
  }
  private static byte[] vector(double x, double y, double z) {
    ByteArrayOutputStream out = new ByteArrayOutputStream();
    field(out, 1, 1, fixed64(x));
    field(out, 2, 1, fixed64(y));
    field(out, 3, 1, fixed64(z));
    return out.toByteArray();
  }
  private static byte[] quaternion(double w, double x, double y, double z) {
    ByteArrayOutputStream out = new ByteArrayOutputStream();
    field(out, 1, 1, fixed64(w));
    field(out, 2, 1, fixed64(x));
    field(out, 3, 1, fixed64(y));
    field(out, 4, 1, fixed64(z));
    return out.toByteArray();
  }
  private static byte[] duration(long seconds, int nanos) {
    ByteArrayOutputStream out = new ByteArrayOutputStream();
    ByteArrayOutputStream secondsOut = new ByteArrayOutputStream();
    varint(secondsOut, seconds);
    field(out, 1, 0, secondsOut.toByteArray());
    ByteArrayOutputStream nanosOut = new ByteArrayOutputStream();
    varint(nanosOut, nanos);
    field(out, 2, 0, nanosOut.toByteArray());
    return out.toByteArray();
  }
  @SuppressWarnings("unchecked")
  private static Map<String, Double> map(Map<String, Object> value, String key) {
    return (Map<String, Double>) value.get(key);
  }
  public static void main(String[] args) throws Exception {
    ByteArrayOutputStream full = new ByteArrayOutputStream();
    field(full, 1, 2, vector(0.1, -0.2, 0.3));
    field(full, 2, 2, quaternion(1, 0, 0, 0));
    field(full, 3, 2, duration(2, 500_000_000));
    field(full, 4, 2, vector(0, 0, 9.8));
    Map<String, Object> parsed = ImuParser.parse(full.toByteArray());
    check(map(parsed, "gyroscope").get("x") == 0.1 && map(parsed, "gyroscope").get("z") == 0.3);
    check(map(parsed, "quaternion").get("w") == 1.0 && map(parsed, "quaternion").get("y") == 0.0);
    check(Long.valueOf(2500L).equals(parsed.get("timestampMs")));
    check(map(parsed, "linearAcceleration").get("z") == 9.8);

    ByteArrayOutputStream partial = new ByteArrayOutputStream();
    field(partial, 1, 2, vector(0, 0, 0));
    field(partial, 2, 2, quaternion(0.5, 0.5, 0.5, 0.5));
    Map<String, Object> withoutAccel = ImuParser.parse(partial.toByteArray());
    check(!withoutAccel.containsKey("linearAcceleration"));
    check(!withoutAccel.containsKey("timestampMs"));
    check(map(withoutAccel, "quaternion").get("x") == 0.5);

    ByteArrayOutputStream zeros = new ByteArrayOutputStream();
    field(zeros, 1, 2, new byte[0]);
    field(zeros, 2, 2, new byte[0]);
    Map<String, Object> defaults = ImuParser.parse(zeros.toByteArray());
    check(map(defaults, "gyroscope").get("x") == 0.0 && map(defaults, "quaternion").get("w") == 0.0);
    check(!defaults.containsKey("linearAcceleration"));

    ByteArrayOutputStream duplicate = new ByteArrayOutputStream();
    field(duplicate, 1, 2, vector(0, 0, 0));
    field(duplicate, 1, 2, vector(1, 0, 0));
    field(duplicate, 2, 2, quaternion(1, 0, 0, 0));
    ByteArrayOutputStream nan = new ByteArrayOutputStream();
    field(nan, 1, 2, vector(Double.NaN, 0, 0));
    field(nan, 2, 2, quaternion(1, 0, 0, 0));
    ByteArrayOutputStream huge = new ByteArrayOutputStream();
    field(huge, 1, 2, vector(1001, 0, 0));
    field(huge, 2, 2, quaternion(1, 0, 0, 0));
    for (byte[] bad : new byte[][] { new byte[0], duplicate.toByteArray(), nan.toByteArray(), huge.toByteArray(), new byte[4097] }) {
      try { ImuParser.parse(bad); throw new AssertionError("accepted malformed fixture"); }
      catch (IOException expected) { /* fixed safe message */ }
    }
    System.out.println("PASS: imu gyroscope quaternion optional acceleration and malformed fixtures");
  }
}
