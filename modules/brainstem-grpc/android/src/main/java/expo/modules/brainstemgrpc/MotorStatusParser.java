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

/** Bounded, read-only projection of all MotorState records. */
public final class MotorStatusParser {
  public static final int MAX_BYTES = 128 * 1024;
  private MotorStatusParser() {}

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
    List<Map<String, Object>> motors = new ArrayList<>();
    while (r.hasNext()) {
      int tag = r.tag();
      int field = tag >>> 3;
      int wire = tag & 7;
      if (field != 1) { r.skip(wire); continue; }
      if (wire != 2 || motors.size() >= 32) throw invalid();
      motors.add(parseMotor(r.message()));
    }
    Map<String, Object> result = new LinkedHashMap<>();
    result.put("motors", motors);
    return result;
  }

  private static Map<String, Object> parseMotor(Reader r) throws IOException {
    int id = 0, statusCode = 0;
    boolean online = false;
    double temperature = 0, voltage = 0, position = 0, velocity = 0, torque = 0;
    List<Integer> errors = new ArrayList<>();
    int seen = 0;
    while (r.hasNext()) {
      int tag = r.tag();
      int field = tag >>> 3;
      int wire = tag & 7;
      if (field >= 1 && field <= 8) {
        int flag = 1 << field;
        if (field != 9 && (seen & flag) != 0) throw invalid();
        seen |= flag;
      }
      switch (field) {
        case 1: r.wire(wire, 0); id = r.uint32(); if (id > 255) throw invalid(); break;
        case 2: r.wire(wire, 0); online = r.bool(); break;
        case 3: r.wire(wire, 0); statusCode = r.uint32(); break;
        case 4: r.wire(wire, 1); temperature = r.doubleValue(-100, 300); break;
        case 5: r.wire(wire, 1); voltage = r.doubleValue(0, 1000); break;
        case 6: r.wire(wire, 1); position = r.doubleValue(-1000, 1000); break;
        case 7: r.wire(wire, 1); velocity = r.doubleValue(-10000, 10000); break;
        case 8: r.wire(wire, 1); torque = r.doubleValue(-10000, 10000); break;
        case 9:
          if (wire == 0) errors.add(r.uint32());
          else if (wire == 2) {
            int size = r.length();
            int end = r.position() + size;
            while (r.position() < end) errors.add(r.uint32());
            if (r.position() != end) throw invalid();
          } else throw invalid();
          if (errors.size() > 64) throw invalid();
          break;
        default: r.skip(wire);
      }
    }
    Map<String, Object> result = new LinkedHashMap<>();
    result.put("id", id); result.put("online", online); result.put("statusCode", statusCode);
    result.put("temperatureC", temperature); result.put("voltageV", voltage);
    result.put("positionRad", position); result.put("velocityRps", velocity); result.put("torqueNm", torque);
    result.put("errors", errors);
    return result;
  }

  private static IOException invalid() { return new IOException("Invalid motor status response"); }

  private static final class Reader {
    private final byte[] bytes;
    private int pos;
    private final int end;
    Reader(byte[] bytes, int start, int end) { this.bytes = bytes; pos = start; this.end = end; }
    boolean hasNext() { return pos < end; }
    int position() { return pos; }
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
    int uint32() throws IOException {
      long value = varint();
      if (value < 0 || value > 0xffffffffL) throw invalid();
      return (int) value;
    }
    boolean bool() throws IOException { return varint() == 1; }
    int tag() throws IOException {
      long value = varint();
      if ((value >>> 3) == 0 || (value >>> 3) > 0x1fffffffL) throw invalid();
      return (int) value;
    }
    void wire(int actual, int expected) throws IOException { if (actual != expected) throw invalid(); }
    int length() throws IOException {
      long value = varint();
      if (value < 0 || value > end - pos) throw invalid();
      return (int) value;
    }
    Reader message() throws IOException {
      int size = length();
      Reader nested = new Reader(bytes, pos, pos + size);
      pos += size;
      return nested;
    }
    double doubleValue(double min, double max) throws IOException {
      if (pos + 8 > end) throw invalid();
      double value = ByteBuffer.wrap(bytes, pos, 8).order(ByteOrder.LITTLE_ENDIAN).getDouble();
      pos += 8;
      if (!Double.isFinite(value) || value < min || value > max) throw invalid();
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
