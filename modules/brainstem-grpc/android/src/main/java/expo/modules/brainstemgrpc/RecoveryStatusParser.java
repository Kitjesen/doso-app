package expo.modules.brainstemgrpc;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;

/** Bounded projection of RobotRecovery status. Missing fields stay at proto3 defaults. */
public final class RecoveryStatusParser {
  public static final int MAX_BYTES = 4096;
  private static final String[] PHASES = {
    "unspecified", "absent", "selected", "enabled", "getting-up", "stable-stand", "exiting"
  };
  private static final String[] REASONS = {
    "none", "unavailable", "model-not-configured", "enable-sequence-unverified", "walking",
    "not-selected", "not-stable", "heartbeat-expired", "precondition"
  };

  private RecoveryStatusParser() {}

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
    int phase = 0;
    int reason = 0;
    boolean sessionSelected = false;
    boolean modelConfigured = false;
    boolean enableSequenceVerified = false;
    boolean stableStand = false;
    boolean locomotionAvailable = false;
    String activeModeId = "";
    String detail = "";
    int seen = 0;
    while (reader.hasNext()) {
      int tag = reader.tag();
      int field = tag >>> 3;
      int wire = tag & 7;
      if (field >= 1 && field <= 8) {
        int flag = 1 << field;
        if ((seen & flag) != 0) throw invalid();
        seen |= flag;
      }
      if (field == 1) phase = reader.enumValue(wire, PHASES.length - 1);
      else if (field == 2) sessionSelected = reader.bool(wire);
      else if (field == 3) modelConfigured = reader.bool(wire);
      else if (field == 4) enableSequenceVerified = reader.bool(wire);
      else if (field == 5) stableStand = reader.bool(wire);
      else if (field == 6) locomotionAvailable = reader.bool(wire);
      else if (field == 7) activeModeId = reader.text(wire, 64);
      else if (field == 8) reason = reader.enumValue(wire, REASONS.length - 1);
      else if (field == 9) detail = reader.text(wire, 200);
      else reader.skip(wire);
    }
    Map<String, Object> result = new LinkedHashMap<>();
    result.put("phase", PHASES[phase]);
    result.put("sessionSelected", sessionSelected);
    result.put("modelConfigured", modelConfigured);
    result.put("enableSequenceVerified", enableSequenceVerified);
    result.put("stableStand", stableStand);
    result.put("locomotionAvailable", locomotionAvailable);
    result.put("activeModeId", activeModeId);
    result.put("reason", REASONS[reason]);
    result.put("detail", detail);
    return result;
  }

  private static IOException invalid() { return new IOException("Invalid recovery response"); }

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
    int enumValue(int wire, int max) throws IOException {
      if (wire != 0) throw invalid();
      long value = varint();
      if (value < 0 || value > max) throw invalid();
      return (int) value;
    }
    boolean bool(int wire) throws IOException {
      if (wire != 0) throw invalid();
      long value = varint();
      if (value > 1) throw invalid();
      return value == 1;
    }
    String text(int wire, int maxChars) throws IOException {
      if (wire != 2) throw invalid();
      int size = length();
      try {
        String value = StandardCharsets.UTF_8.newDecoder()
          .onMalformedInput(CodingErrorAction.REPORT)
          .onUnmappableCharacter(CodingErrorAction.REPORT)
          .decode(ByteBuffer.wrap(bytes, pos, size)).toString();
        pos += size;
        if (value.indexOf('\u0000') >= 0 || value.length() > maxChars) throw invalid();
        return value;
      } catch (CharacterCodingException error) {
        throw invalid();
      }
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
