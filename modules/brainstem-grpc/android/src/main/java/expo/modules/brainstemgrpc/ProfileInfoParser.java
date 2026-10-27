package expo.modules.brainstemgrpc;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Bounded, read-only projection of RobotControl.GetProfile. */
public final class ProfileInfoParser {
  public static final int MAX_BYTES = 64 * 1024;

  private ProfileInfoParser() {}

  public static byte[] readBounded(InputStream input) throws IOException {
    ByteArrayOutputStream out = new ByteArrayOutputStream();
    byte[] chunk = new byte[1024];
    int count;
    while ((count = input.read(chunk)) != -1) {
      if (count == 0) throw invalid();
      if (out.size() + count > MAX_BYTES) throw invalid();
      out.write(chunk, 0, count);
    }
    return out.toByteArray();
  }

  public static Map<String, Object> parse(byte[] bytes) throws IOException {
    if (bytes == null || bytes.length > MAX_BYTES) throw invalid();
    Reader r = new Reader(bytes, 0, bytes.length);
    String current = "";
    String currentDescription = "";
    List<String> available = new ArrayList<>();
    List<String> descriptions = new ArrayList<>();
    int seen = 0;
    while (r.hasNext()) {
      int tag = r.tag();
      int field = tag >>> 3;
      int wire = tag & 7;
      if (field == 1 || field == 4) {
        int flag = 1 << field;
        if ((seen & flag) != 0) throw invalid();
        seen |= flag;
      }
      if (field == 1) current = r.string(wire);
      else if (field == 2) {
        if (available.size() >= 64) throw invalid();
        available.add(r.string(wire));
      } else if (field == 3) {
        if (descriptions.size() >= 64) throw invalid();
        descriptions.add(r.string(wire));
      } else if (field == 4) currentDescription = r.string(wire);
      else r.skip(wire);
    }
    Map<String, Object> result = new LinkedHashMap<>();
    result.put("current", current);
    result.put("available", available);
    result.put("descriptions", descriptions);
    result.put("currentDescription", currentDescription);
    return result;
  }

  private static IOException invalid() { return new IOException("Invalid profile response"); }

  private static final class Reader {
    private final byte[] bytes;
    private int pos;
    private final int end;
    Reader(byte[] bytes, int start, int end) { this.bytes = bytes; pos = start; this.end = end; }
    boolean hasNext() { return pos < end; }
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
    int length() throws IOException {
      long size = uint32();
      if (size > end - pos) throw invalid();
      return (int) size;
    }
    String string(int wire) throws IOException {
      if (wire != 2) throw invalid();
      int size = length();
      try {
        String value = StandardCharsets.UTF_8.newDecoder()
          .onMalformedInput(CodingErrorAction.REPORT)
          .onUnmappableCharacter(CodingErrorAction.REPORT)
          .decode(ByteBuffer.wrap(bytes, pos, size)).toString();
        if (value.indexOf('\u0000') >= 0 || value.length() > 512) throw invalid();
        pos += size;
        return value;
      } catch (CharacterCodingException e) {
        throw invalid();
      }
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
