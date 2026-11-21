package expo.modules.brainstemgrpc;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;

/** Standalone JVM tests run by scripts/brainstem-grpc-native.test.mjs. */
public final class GestureListParserTest {
  private static void check(boolean condition, String message) {
    if (!condition) throw new AssertionError(message);
  }

  private static byte[] varint(long value) {
    ByteArrayOutputStream out = new ByteArrayOutputStream();
    while ((value & ~0x7fL) != 0) {
      out.write((int) (value & 0x7f) | 0x80);
      value >>>= 7;
    }
    out.write((int) value);
    return out.toByteArray();
  }

  private static byte[] fieldVarint(int field, long value) throws IOException {
    ByteArrayOutputStream out = new ByteArrayOutputStream();
    out.write(varint(field << 3));
    out.write(varint(value));
    return out.toByteArray();
  }

  private static byte[] fieldBytes(int field, byte[] value) throws IOException {
    ByteArrayOutputStream out = new ByteArrayOutputStream();
    out.write(varint((field << 3) | 2));
    out.write(varint(value.length));
    out.write(value);
    return out.toByteArray();
  }

  private static byte[] fieldText(int field, String value) throws IOException {
    return fieldBytes(field, value.getBytes(StandardCharsets.UTF_8));
  }

  private static void expectInvalid(byte[] bytes, String label) {
    try {
      GestureListParser.parse(bytes);
      throw new AssertionError("Expected rejection for: " + label);
    } catch (IOException expected) {
      // Expected rejection.
    }
  }

  public static void main(String[] args) throws Exception {
    check(GestureListParser.parse(new byte[0]).isEmpty(), "empty gesture list");

    ByteArrayOutputStream info1 = new ByteArrayOutputStream();
    info1.write(fieldText(1, "bow"));
    info1.write(fieldText(2, "鞠躬"));
    info1.write(fieldVarint(3, 1800));

    ByteArrayOutputStream info2 = new ByteArrayOutputStream();
    info2.write(fieldText(1, "nod"));

    ByteArrayOutputStream listBytes = new ByteArrayOutputStream();
    listBytes.write(fieldBytes(1, info1.toByteArray()));
    listBytes.write(fieldBytes(1, info2.toByteArray()));
    // Unknown field 99 skipped safely
    listBytes.write(fieldVarint(99, 7));

    List<Map<String, Object>> parsed = GestureListParser.parse(listBytes.toByteArray());
    check(parsed.size() == 2, "parsed count");
    check("bow".equals(parsed.get(0).get("name")), "first name");
    check("鞠躬".equals(parsed.get(0).get("description")), "first description");
    check(Integer.valueOf(1800).equals(parsed.get(0).get("durationMs")), "first duration");
    check("nod".equals(parsed.get(1).get("name")), "second name");
    check("".equals(parsed.get(1).get("description")), "default description");
    check(Integer.valueOf(0).equals(parsed.get(1).get("durationMs")), "default duration");

    // Reject missing name
    expectInvalid(fieldBytes(1, fieldText(2, "no name")), "missing name");
    // Reject NUL byte in name or description
    expectInvalid(fieldBytes(1, fieldText(1, "bad\0name")), "nul in name");
    expectInvalid(fieldBytes(1, new ByteArrayOutputStream() {{
      write(fieldText(1, "ok"));
      write(fieldText(2, "bad\0desc"));
    }}.toByteArray()), "nul in description");
    // Reject > 64 chars name
    expectInvalid(fieldBytes(1, fieldText(1, "a".repeat(65))), "oversized name");
    // Reject duplicate field 1 in GestureInfo
    expectInvalid(fieldBytes(1, new ByteArrayOutputStream() {{
      write(fieldText(1, "a"));
      write(fieldText(1, "b"));
    }}.toByteArray()), "duplicate name field");
    // Reject > 64 gestures
    ByteArrayOutputStream tooMany = new ByteArrayOutputStream();
    byte[] single = fieldBytes(1, fieldText(1, "g"));
    for (int i = 0; i <= GestureListParser.MAX_GESTURES; i++) tooMany.write(single);
    expectInvalid(tooMany.toByteArray(), "too many gestures");
    // Reject excessive duration
    expectInvalid(fieldBytes(1, new ByteArrayOutputStream() {{
      write(fieldText(1, "slow"));
      write(fieldVarint(3, GestureListParser.MAX_DURATION_MS + 1L));
    }}.toByteArray()), "duration overflow");

    System.out.println("PASS: gesture list protobuf projections and bounds");
  }
}
