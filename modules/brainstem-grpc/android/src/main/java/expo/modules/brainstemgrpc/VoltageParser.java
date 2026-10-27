package expo.modules.brainstemgrpc;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Bounded projection of Voltage.values; it is bus voltage, not battery SOC. */
public final class VoltageParser {
  public static final int MAX_BYTES = 64 * 1024;
  private VoltageParser() {}

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
    Reader r = new Reader(bytes);
    List<Double> values = new ArrayList<>();
    while (r.hasNext()) {
      int tag = r.tag();
      int field = tag >>> 3;
      int wire = tag & 7;
      if (field != 1) { r.skip(wire); continue; }
      if (wire == 1) values.add(r.fixed64());
      else if (wire == 2) {
        int size = r.length();
        if ((size & 7) != 0 || size / 8 > 32) throw invalid();
        int end = r.position() + size;
        while (r.position() < end) values.add(r.fixed64());
        if (r.position() != end) throw invalid();
      } else throw invalid();
      if (values.size() > 32) throw invalid();
    }
    Map<String, Object> result = new LinkedHashMap<>();
    result.put("values", values);
    return result;
  }

  private static IOException invalid() { return new IOException("Invalid voltage response"); }

  private static final class Reader {
    private final byte[] bytes;
    private int pos;
    Reader(byte[] bytes) { this.bytes = bytes; }
    int position() { return pos; }
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
    double fixed64() throws IOException {
      if (pos + 8 > bytes.length) throw invalid();
      double value = ByteBuffer.wrap(bytes, pos, 8).order(ByteOrder.LITTLE_ENDIAN).getDouble();
      pos += 8;
      if (!Double.isFinite(value) || value < 0 || value > 1000) throw invalid();
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
