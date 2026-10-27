package expo.modules.brainstemgrpc;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;

public final class ProfileInfoParserTest {
  private static void check(boolean condition, String message) {
    if (!condition) throw new AssertionError(message);
  }

  private static void field(ByteArrayOutputStream out, int number, String value) {
    byte[] bytes = value.getBytes(StandardCharsets.UTF_8);
    out.write(number << 3 | 2);
    out.write(bytes.length);
    out.writeBytes(bytes);
  }

  public static void main(String[] args) throws Exception {
    ByteArrayOutputStream encoded = new ByteArrayOutputStream();
    field(encoded, 1, "flat_v0");
    field(encoded, 2, "flat_v0");
    field(encoded, 2, "stairs_candidate");
    field(encoded, 3, "Flat");
    field(encoded, 3, "Stairs");
    field(encoded, 4, "Flat");
    Map<String, Object> parsed = ProfileInfoParser.parse(encoded.toByteArray());
    check("flat_v0".equals(parsed.get("current")), "current");
    check(((List<?>) parsed.get("available")).size() == 2, "available");
    check(((List<?>) parsed.get("descriptions")).size() == 2, "descriptions");
    check("Flat".equals(parsed.get("currentDescription")), "currentDescription");
    check(ProfileInfoParser.readBounded(new ByteArrayInputStream(encoded.toByteArray())).length == encoded.size(), "bounded read");

    byte[] malformed = new byte[] { 0x0a, 0x02, (byte) 0xc3, 0x28 };
    try {
      ProfileInfoParser.parse(malformed);
      throw new AssertionError("malformed UTF-8 accepted");
    } catch (java.io.IOException expected) {
      // fail closed
    }
    System.out.println("PASS: profile metadata, repeated fields, bounded input and malformed UTF-8");
  }
}
