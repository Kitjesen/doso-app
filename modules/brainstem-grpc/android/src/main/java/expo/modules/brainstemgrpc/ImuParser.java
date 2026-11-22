package expo.modules.brainstemgrpc;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.LinkedHashMap;
import java.util.Map;

/** Bounded projection of Imu. Absent linear_acceleration stays absent. */
public final class ImuParser {
  public static final int MAX_BYTES = 4096;
  private ImuParser() {}

  public static byte[] readBounded(InputStream input) throws IOException {
    ByteArrayOutputStream out = new ByteArrayOutputStream();
    byte[] chunk = new byte[1024];
    int count;
    while ((count = input.read(chunk)) != -1) {
      if (count == 0 || out.size() + count > MAX_BYTES) throw invalid();
      out.write(chunk, 0, count);
    }
    return out.toByteArray();
  }

  public static Map<String, Object> parse(byte[] bytes) throws IOException {
    if (bytes == null || bytes.length > MAX_BYTES) throw invalid();
    Reader reader = new Reader(bytes);
    Map<String, Double> gyroscope = null;
    Map<String, Double> quaternion = null;
    Map<String, Double> linearAcceleration = null;
    Long timestampMs = null;
    while (reader.hasNext()) {
      int tag = reader.tag();
      int field = tag >>> 3;
      int wire = tag & 7;
      if (field == 1 || field == 2 || field == 4) {
        if (wire != 2) throw invalid();
        byte[] nested = reader.bytes(reader.length());
        Map<String, Double> vector = field == 2 ? quaternion(nested) : vector3(nested);
        if (field == 1) {
          if (gyroscope != null) throw invalid();
          gyroscope = vector;
        } else if (field == 2) {
          if (quaternion != null) throw invalid();
          quaternion = vector;
        } else {
          if (linearAcceleration != null) throw invalid();
          linearAcceleration = vector;
        }
      } else if (field == 3) {
        if (wire != 2 || timestampMs != null) throw invalid();
        timestampMs = durationMs(reader.bytes(reader.length()));
      } else reader.skip(wire);
    }
    if (gyroscope == null || quaternion == null) throw invalid();
    Map<String, Object> result = new LinkedHashMap<>();
    result.put("gyroscope", gyroscope);
    result.put("quaternion", quaternion);
    if (timestampMs != null) result.put("timestampMs", timestampMs);
    if (linearAcceleration != null) result.put("linearAcceleration", linearAcceleration);
    return result;
  }

  private static Map<String, Double> vector3(byte[] bytes) throws IOException {
    Reader reader = new Reader(bytes);
    boolean seenX = false, seenY = false, seenZ = false;
    double x = 0, y = 0, z = 0;
    while (reader.hasNext()) {
      int tag = reader.tag();
      int field = tag >>> 3;
      int wire = tag & 7;
      if (field < 1 || field > 3) { reader.skip(wire); continue; }
      if (wire != 1) throw invalid();
      double value = reader.fixed64(1000);
      if (field == 1) { if (seenX) throw invalid(); seenX = true; x = value; }
      else if (field == 2) { if (seenY) throw invalid(); seenY = true; y = value; }
      else { if (seenZ) throw invalid(); seenZ = true; z = value; }
    }
    Map<String, Double> vector = new LinkedHashMap<>();
    vector.put("x", x); vector.put("y", y); vector.put("z", z);
    return vector;
  }

  private static Map<String, Double> quaternion(byte[] bytes) throws IOException {
    Reader reader = new Reader(bytes);
    boolean[] seen = new boolean[4];
    double[] value = new double[4];
    while (reader.hasNext()) {
      int tag = reader.tag();
      int field = tag >>> 3;
      int wire = tag & 7;
      if (field < 1 || field > 4) { reader.skip(wire); continue; }
      if (wire != 1) throw invalid();
      if (seen[field - 1]) throw invalid();
      seen[field - 1] = true;
      value[field - 1] = reader.fixed64(2);
    }
    Map<String, Double> quaternion = new LinkedHashMap<>();
    quaternion.put("w", value[0]); quaternion.put("x", value[1]);
    quaternion.put("y", value[2]); quaternion.put("z", value[3]);
    return quaternion;
  }

  private static long durationMs(byte[] bytes) throws IOException {
    Reader reader = new Reader(bytes);
    boolean seenSeconds = false, seenNanos = false;
    long seconds = 0;
    int nanos = 0;
    while (reader.hasNext()) {
      int tag = reader.tag();
      int field = tag >>> 3;
      int wire = tag & 7;
      if (field == 1) {
        if (wire != 0 || seenSeconds) throw invalid();
        seenSeconds = true;
        seconds = reader.varint();
        if (seconds < 0 || seconds > 1_000_000_000_000L) throw invalid();
      } else if (field == 2) {
        if (wire != 0 || seenNanos) throw invalid();
        seenNanos = true;
        long raw = reader.varint();
        if (raw < 0 || raw > 999_999_999L) throw invalid();
        nanos = (int) raw;
      } else reader.skip(wire);
    }
    return seconds * 1000L + nanos / 1_000_000L;
  }

  private static IOException invalid() { return new IOException("Invalid IMU response"); }

  private static final class Reader {
    private final byte[] bytes;
    private int pos;
    Reader(byte[] bytes) { this.bytes = bytes; }
    boolean hasNext() { return pos < bytes.length; }
    long varint() throws IOException {
      long result = 0;
      for (int i = 0; i < 10; i++) {
        if (pos >= bytes.length) throw invalid();
        int b = bytes[pos++] & 255;
        if (i == 9 && b > 1) throw invalid();
        result |= (long) (b & 127) << (7 * i);
        if ((b & 128) == 0) return result;
      }
      throw invalid();
    }
    int tag() throws IOException {
      long value = varint();
      if ((value >>> 3) == 0 || (value >>> 3) > 0x1fffffffL) throw invalid();
      return (int) value;
    }
    int length() throws IOException {
      long value = varint();
      if (value < 0 || value > bytes.length - pos) throw invalid();
      return (int) value;
    }
    byte[] bytes(int count) throws IOException {
      if (count < 0 || count > bytes.length - pos) throw invalid();
      byte[] value = new byte[count];
      System.arraycopy(bytes, pos, value, 0, count);
      pos += count;
      return value;
    }
    double fixed64(double limit) throws IOException {
      if (pos + 8 > bytes.length) throw invalid();
      double value = ByteBuffer.wrap(bytes, pos, 8).order(ByteOrder.LITTLE_ENDIAN).getDouble();
      pos += 8;
      if (!Double.isFinite(value) || Math.abs(value) > limit) throw invalid();
      return value;
    }
    void advance(int count) throws IOException {
      if (count < 0 || count > bytes.length - pos) throw invalid();
      pos += count;
    }
    void skip(int wire) throws IOException {
      switch (wire) {
        case 0: varint(); break;
        case 1: advance(8); break;
        case 2: advance(length()); break;
        case 5: advance(4); break;
        default: throw invalid();
      }
    }
  }
}
