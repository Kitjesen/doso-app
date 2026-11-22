package expo.modules.brainstemgrpc;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
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
    List<Map<String, Object>> capabilities = null;
    String activeModeId = null;
    boolean activeSeen = false;
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
      else if (field == 5) {
        if (wire != 2) throw invalid();
        if (capabilities == null) capabilities = new ArrayList<>();
        if (capabilities.size() >= 16) throw invalid();
        capabilities.add(capability(r.bytes(r.length())));
      } else if (field == 6) {
        if (activeSeen) throw invalid();
        activeSeen = true;
        activeModeId = r.string(wire);
        if (activeModeId.length() > 64) throw invalid();
      } else r.skip(wire);
    }
    Map<String, Object> result = new LinkedHashMap<>();
    result.put("current", current);
    result.put("available", available);
    result.put("descriptions", descriptions);
    result.put("currentDescription", currentDescription);
    if (capabilities != null) result.put("modeCapabilities", capabilities);
    if (activeSeen) result.put("activeModeId", activeModeId);
    return result;
  }

  private static Map<String, Object> capability(byte[] bytes) throws IOException {
    Reader reader = new Reader(bytes, 0, bytes.length);
    String id = "";
    String profileId = "";
    String unavailableReason = "";
    int kind = 0;
    int availability = 0;
    Map<String, Object> bodyHeight = null;
    int seen = 0;
    while (reader.hasNext()) {
      int tag = reader.tag();
      int field = tag >>> 3;
      int wire = tag & 7;
      if (field == 1) id = reader.string(wire);
      else if (field == 2) {
        if (wire != 0 || (seen & 2) != 0) throw invalid();
        seen |= 2;
        long value = reader.uint32();
        if (value > 255) throw invalid();
        kind = (int) value;
      } else if (field == 3) {
        // RobotModeAvailability. A string here is the retired label layout and must not parse.
        if (wire != 0 || (seen & 4) != 0) throw invalid();
        seen |= 4;
        long value = reader.uint32();
        if (value > 2) throw invalid();
        availability = (int) value;
      } else if (field == 4) {
        if ((seen & 8) != 0) throw invalid();
        seen |= 8;
        profileId = reader.string(wire);
      } else if (field == 5) unavailableReason = reader.string(wire);
      else if (field == 6) {
        if (wire != 2 || (seen & 32) != 0) throw invalid();
        seen |= 32;
        bodyHeight = bodyHeightCapability(reader.bytes(reader.length()));
      } else reader.skip(wire);
    }
    if (id.length() > 64 || profileId.length() > 128 || unavailableReason.length() > 200) throw invalid();
    Map<String, Object> value = new LinkedHashMap<>();
    value.put("id", id);
    // 1 is LOCOMOTION_PROFILE. 3 is BODY_HEIGHT. Unknown future kinds degrade to unspecified.
    value.put("kind", kind == 1 ? "locomotion" : kind == 2 ? "recovery-action" : kind == 3 ? "body-height" : "unspecified");
    value.put("availability", availability == 1 ? "unavailable" : availability == 2 ? "available" : "unknown");
    value.put("profileId", profileId);
    value.put("available", availability == 2);
    value.put("unavailableReason", unavailableReason);
    if (bodyHeight != null) value.put("bodyHeight", bodyHeight);
    return value;
  }

  private static Map<String, Object> bodyHeightCapability(byte[] bytes) throws IOException {
    Reader reader = new Reader(bytes, 0, bytes.length);
    double defaultHeightM = 0.0;
    double minHeightM = 0.0;
    double maxHeightM = 0.0;
    double rateMps = 0.0;
    int seen = 0;
    while (reader.hasNext()) {
      int tag = reader.tag();
      int field = tag >>> 3;
      int wire = tag & 7;
      if (field >= 1 && field <= 4) {
        int bit = 1 << field;
        if (wire != 1 || (seen & bit) != 0) throw invalid();
        seen |= bit;
        if (field == 1) defaultHeightM = reader.fixed64(BodyHeightStatusParser.MAX_HEIGHT_M);
        else if (field == 2) minHeightM = reader.fixed64(BodyHeightStatusParser.MAX_HEIGHT_M);
        else if (field == 3) maxHeightM = reader.fixed64(BodyHeightStatusParser.MAX_HEIGHT_M);
        else rateMps = reader.fixed64(BodyHeightStatusParser.MAX_RATE_MPS);
      } else reader.skip(wire);
    }
    if (minHeightM > 0.0 && maxHeightM > 0.0 && minHeightM > maxHeightM) throw invalid();
    Map<String, Object> result = new LinkedHashMap<>();
    result.put("defaultHeightM", defaultHeightM);
    result.put("minHeightM", minHeightM);
    result.put("maxHeightM", maxHeightM);
    result.put("rateMps", rateMps);
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
    byte[] bytes(int count) throws IOException {
      if (count < 0 || count > end - pos) throw invalid();
      byte[] value = new byte[count];
      System.arraycopy(bytes, pos, value, 0, count);
      pos += count;
      return value;
    }
    double fixed64(double limit) throws IOException {
      if (pos + 8 > end) throw invalid();
      double value = ByteBuffer.wrap(bytes, pos, 8).order(ByteOrder.LITTLE_ENDIAN).getDouble();
      pos += 8;
      if (!Double.isFinite(value) || value < 0.0 || value > limit) throw invalid();
      return value;
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
