package expo.modules.brainstemgrpc;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.LinkedHashMap;
import java.util.Map;

/** Bounded, read-only projection of RobotControl.GetBodyHeightStatus / SetBodyHeight. */
public final class BodyHeightStatusParser {
  public static final int MAX_BYTES = 4096;
  public static final double MAX_HEIGHT_M = 5.0;
  public static final double MAX_RATE_MPS = 10.0;

  private BodyHeightStatusParser() {}

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
    Reader r = new Reader(bytes, 0, bytes.length);
    boolean supported = false;
    double currentHeightM = 0.0;
    double targetHeightM = 0.0;
    double minHeightM = 0.0;
    double maxHeightM = 0.0;
    double rateMps = 0.0;
    int seen = 0;
    while (r.hasNext()) {
      int tag = r.tag();
      int field = tag >>> 3;
      int wire = tag & 7;
      if (field >= 1 && field <= 6) {
        int bit = 1 << field;
        if ((seen & bit) != 0) throw invalid();
        seen |= bit;
      }
      switch (field) {
        case 1:
          r.wire(wire, 0);
          supported = r.bool();
          break;
        case 2:
          r.wire(wire, 1);
          currentHeightM = r.fixed64(MAX_HEIGHT_M);
          break;
        case 3:
          r.wire(wire, 1);
          targetHeightM = r.fixed64(MAX_HEIGHT_M);
          break;
        case 4:
          r.wire(wire, 1);
          minHeightM = r.fixed64(MAX_HEIGHT_M);
          break;
        case 5:
          r.wire(wire, 1);
          maxHeightM = r.fixed64(MAX_HEIGHT_M);
          break;
        case 6:
          r.wire(wire, 1);
          rateMps = r.fixed64(MAX_RATE_MPS);
          break;
        default:
          r.skip(wire);
      }
    }
    if (minHeightM > 0.0 && maxHeightM > 0.0 && minHeightM > maxHeightM) throw invalid();
    Map<String, Object> result = new LinkedHashMap<>();
    result.put("supported", supported);
    result.put("currentHeightM", currentHeightM);
    result.put("targetHeightM", targetHeightM);
    result.put("minHeightM", minHeightM);
    result.put("maxHeightM", maxHeightM);
    result.put("rateMps", rateMps);
    return result;
  }

  private static IOException invalid() { return new IOException("Invalid body height status"); }

  private static final class Reader {
    private final byte[] bytes;
    private int pos;
    private final int end;

    Reader(byte[] bytes, int start, int end) {
      this.bytes = bytes;
      this.pos = start;
      this.end = end;
    }

    boolean hasNext() { return pos < end; }

    void wire(int actual, int expected) throws IOException {
      if (actual != expected) throw invalid();
    }

    long varint() throws IOException {
      long result = 0;
      for (int i = 0; i < 10; i++) {
        if (pos >= end) throw invalid();
        int b = bytes[pos++] & 255;
        if (i == 9 && b > 1) throw invalid();
        result |= (long) (b & 127) << (7 * i);
        if ((b & 128) == 0) return result;
      }
      throw invalid();
    }

    long uint32() throws IOException {
      long value = varint();
      if (value < 0 || value > 0xffffffffL) throw invalid();
      return value;
    }

    int tag() throws IOException {
      long value = uint32();
      if ((value >>> 3) == 0 || (value >>> 3) > 0x1fffffffL) throw invalid();
      return (int) value;
    }

    boolean bool() throws IOException {
      long value = varint();
      if (value != 0L && value != 1L) throw invalid();
      return value == 1L;
    }

    int length() throws IOException {
      long size = uint32();
      if (size > end - pos) throw invalid();
      return (int) size;
    }

    double fixed64(double limit) throws IOException {
      if (pos + 8 > end) throw invalid();
      double value = ByteBuffer.wrap(bytes, pos, 8).order(ByteOrder.LITTLE_ENDIAN).getDouble();
      pos += 8;
      if (!Double.isFinite(value) || value < 0.0 || value > limit) throw invalid();
      return value;
    }

    void advance(int count) throws IOException {
      if (count < 0 || count > end - pos) throw invalid();
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
