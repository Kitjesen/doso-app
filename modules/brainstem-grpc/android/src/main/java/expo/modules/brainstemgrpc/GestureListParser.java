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

/** Bounded projection of cms.proto GestureList / GestureInfo. */
public final class GestureListParser {
  public static final int MAX_BYTES = 64 * 1024;
  public static final int MAX_GESTURES = 64;
  public static final int MAX_NAME_CHARS = 64;
  public static final int MAX_NAME_BYTES = 128;
  public static final int MAX_DESCRIPTION_BYTES = 512;
  public static final int MAX_DURATION_MS = 300_000;

  private GestureListParser() {}

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

  public static List<Map<String, Object>> parse(byte[] bytes) throws IOException {
    if (bytes == null || bytes.length > MAX_BYTES) throw invalid();
    Reader reader = new Reader(bytes, 0, bytes.length);
    List<Map<String, Object>> gestures = new ArrayList<>();
    while (reader.hasNext()) {
      int tag = reader.tag();
      int field = tag >>> 3;
      int wire = tag & 7;
      if (field == 1) {
        if (wire != 2 || gestures.size() >= MAX_GESTURES) throw invalid();
        gestures.add(parseGestureInfo(reader.nested()));
      } else {
        reader.skip(wire);
      }
    }
    return gestures;
  }

  private static Map<String, Object> parseGestureInfo(Reader info) throws IOException {
    String name = "";
    String description = "";
    int durationMs = 0;
    int seen = 0;
    while (info.hasNext()) {
      int tag = info.tag();
      int field = tag >>> 3;
      int wire = tag & 7;
      if (field >= 1 && field <= 3) {
        int bit = 1 << field;
        if ((seen & bit) != 0) throw invalid();
        seen |= bit;
      }
      if (field == 1) {
        if (wire != 2) throw invalid();
        name = info.text(MAX_NAME_BYTES);
        if (name.isEmpty() || name.length() > MAX_NAME_CHARS) throw invalid();
      } else if (field == 2) {
        if (wire != 2) throw invalid();
        description = info.text(MAX_DESCRIPTION_BYTES);
      } else if (field == 3) {
        if (wire != 0) throw invalid();
        long duration = info.varint();
        if (duration < 0 || duration > MAX_DURATION_MS) throw invalid();
        durationMs = (int) duration;
      } else {
        info.skip(wire);
      }
    }
    if (name.isEmpty()) throw invalid();
    Map<String, Object> item = new LinkedHashMap<>();
    item.put("name", name);
    item.put("description", description);
    item.put("durationMs", durationMs);
    return item;
  }

  private static IOException invalid() {
    return new IOException("Invalid gesture list response");
  }

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

    int tag() throws IOException {
      long value = varint();
      if (value < 8 || value > 0xffffffffL || (value >>> 3) == 0 || (value >>> 3) > 0x1fffffffL) throw invalid();
      return (int) value;
    }

    int length() throws IOException {
      long size = varint();
      if (size < 0 || size > end - pos) throw invalid();
      return (int) size;
    }

    Reader nested() throws IOException {
      int size = length();
      Reader nested = new Reader(bytes, pos, pos + size);
      pos += size;
      return nested;
    }

    String text(int maxBytes) throws IOException {
      int size = length();
      if (size > maxBytes) throw invalid();
      String decoded;
      try {
        decoded = StandardCharsets.UTF_8.newDecoder()
          .onMalformedInput(CodingErrorAction.REPORT)
          .onUnmappableCharacter(CodingErrorAction.REPORT)
          .decode(ByteBuffer.wrap(bytes, pos, size))
          .toString();
      } catch (CharacterCodingException error) {
        throw invalid();
      }
      if (decoded.indexOf('\0') >= 0) throw invalid();
      pos += size;
      return decoded;
    }

    void skip(int wire) throws IOException {
      if (wire == 0) varint();
      else if (wire == 2) pos += length();
      else if (wire == 1 || wire == 5) {
        int count = wire == 1 ? 8 : 4;
        if (count > end - pos) throw invalid();
        pos += count;
      } else {
        throw invalid();
      }
    }
  }
}
