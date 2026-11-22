package expo.modules.brainstemgrpc;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
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

  private static void varint(ByteArrayOutputStream out, int value) {
    while ((value & ~0x7f) != 0) { out.write((value & 0x7f) | 0x80); value >>>= 7; }
    out.write(value);
  }

  private static void message(ByteArrayOutputStream out, int number, byte[] value) {
    out.write(number << 3 | 2);
    varint(out, value.length);
    out.write(value, 0, value.length);
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
    check(!parsed.containsKey("modeCapabilities"), "old server must not advertise recovery");
    ByteArrayOutputStream mode = new ByteArrayOutputStream();
    field(mode, 1, "recovery"); mode.write(16); mode.write(2); mode.write(24); mode.write(1);
    field(mode, 5, "Not configured");
    encoded.write(42); encoded.write(mode.size()); encoded.writeBytes(mode.toByteArray());
    field(encoded, 6, "recovery");
    parsed = ProfileInfoParser.parse(encoded.toByteArray());
    Map<?, ?> recoveryMode = (Map<?, ?>)((List<?>)parsed.get("modeCapabilities")).get(0);
    check("recovery".equals(parsed.get("activeModeId")), "active recovery");
    check("recovery-action".equals(recoveryMode.get("kind")), "action kind");
    check("unavailable".equals(recoveryMode.get("availability")), "unavailable recovery");
    try { ProfileInfoParser.parse(new byte[]{42, 2, 16, (byte)128}); throw new AssertionError("truncated mode accepted"); }
    catch (java.io.IOException expected) { }

    ByteArrayOutputStream capability = new ByteArrayOutputStream();
    field(capability, 1, "recovery");
    capability.write(2 << 3);
    capability.write(2);
    capability.write(3 << 3);
    capability.write(2);
    ByteArrayOutputStream withMode = new ByteArrayOutputStream();
    field(withMode, 1, "flat");
    message(withMode, 5, capability.toByteArray());
    field(withMode, 6, "");
    Map<String, Object> live = ProfileInfoParser.parse(withMode.toByteArray());
    @SuppressWarnings("unchecked") List<Map<String, Object>> modes = (List<Map<String, Object>>) live.get("modeCapabilities");
    check(modes.size() == 1 && "recovery".equals(modes.get(0).get("id")), "recovery id");
    check("recovery-action".equals(modes.get(0).get("kind")), "recovery kind");
    check("available".equals(modes.get(0).get("availability")) && Boolean.TRUE.equals(modes.get(0).get("available")), "availability");
    check("".equals(modes.get(0).get("profileId")) && "".equals(modes.get(0).get("unavailableReason")), "empty profile id");
    check("".equals(live.get("activeModeId")), "empty active mode");

    ByteArrayOutputStream heightCap = new ByteArrayOutputStream();
    field(heightCap, 1, "height");
    heightCap.write(2 << 3); heightCap.write(3);
    heightCap.write(3 << 3); heightCap.write(2);
    field(heightCap, 4, "single_frame_height_v2");
    message(heightCap, 6, new byte[]{9, 0, 0, 0, 0, 0, 0, (byte) 0xd8, 0x3f});
    ByteArrayOutputStream withHeight = new ByteArrayOutputStream();
    field(withHeight, 1, "flat");
    message(withHeight, 5, heightCap.toByteArray());
    Map<String, Object> parsedHeight = ProfileInfoParser.parse(withHeight.toByteArray());
    @SuppressWarnings("unchecked") List<Map<String, Object>> heightModes = (List<Map<String, Object>>) parsedHeight.get("modeCapabilities");
    check("body-height".equals(heightModes.get(0).get("kind")), "body-height kind");
    check("single_frame_height_v2".equals(heightModes.get(0).get("profileId")), "body-height profileId");
    @SuppressWarnings("unchecked") Map<String, Object> parsedHeightCap = (Map<String, Object>) heightModes.get(0).get("bodyHeight");
    check(parsedHeightCap != null && Math.abs((Double) parsedHeightCap.get("defaultHeightM") - 0.375) < 1e-9, "body-height defaultHeightM");

    ByteArrayOutputStream fullHeightMsg = new ByteArrayOutputStream();
    for (int i = 0; i < 4; i++) {
      double[] values = new double[]{0.375, 0.25, 0.50, 0.05};
      fullHeightMsg.write(((i + 1) << 3) | 1);
      fullHeightMsg.writeBytes(ByteBuffer.allocate(8).order(ByteOrder.LITTLE_ENDIAN).putDouble(values[i]).array());
    }
    ByteArrayOutputStream fullHeightCap = new ByteArrayOutputStream();
    field(fullHeightCap, 1, "height");
    fullHeightCap.write(2 << 3); fullHeightCap.write(3);
    fullHeightCap.write(3 << 3); fullHeightCap.write(2);
    field(fullHeightCap, 4, "single_frame_height_v2");
    message(fullHeightCap, 6, fullHeightMsg.toByteArray());
    ByteArrayOutputStream withFullHeight = new ByteArrayOutputStream();
    field(withFullHeight, 1, "flat");
    message(withFullHeight, 5, fullHeightCap.toByteArray());
    Map<String, Object> parsedFull = ProfileInfoParser.parse(withFullHeight.toByteArray());
    @SuppressWarnings("unchecked") List<Map<String, Object>> fullModes = (List<Map<String, Object>>) parsedFull.get("modeCapabilities");
    @SuppressWarnings("unchecked") Map<String, Object> bh = (Map<String, Object>) fullModes.get(0).get("bodyHeight");
    check(bh != null
      && Math.abs((Double) bh.get("defaultHeightM") - 0.375) < 1e-9
      && Math.abs((Double) bh.get("minHeightM") - 0.25) < 1e-9
      && Math.abs((Double) bh.get("maxHeightM") - 0.50) < 1e-9
      && Math.abs((Double) bh.get("rateMps") - 0.05) < 1e-9, "full bodyHeight capability");

    // Inverted min/max in body_height capability must fail closed.
    ByteArrayOutputStream badHeightMsg = new ByteArrayOutputStream();
    badHeightMsg.write((2 << 3) | 1);
    badHeightMsg.writeBytes(ByteBuffer.allocate(8).order(ByteOrder.LITTLE_ENDIAN).putDouble(0.55).array());
    badHeightMsg.write((3 << 3) | 1);
    badHeightMsg.writeBytes(ByteBuffer.allocate(8).order(ByteOrder.LITTLE_ENDIAN).putDouble(0.25).array());
    ByteArrayOutputStream badHeightCap = new ByteArrayOutputStream();
    field(badHeightCap, 1, "height");
    badHeightCap.write(2 << 3); badHeightCap.write(3);
    badHeightCap.write(3 << 3); badHeightCap.write(2);
    message(badHeightCap, 6, badHeightMsg.toByteArray());
    ByteArrayOutputStream withBadHeight = new ByteArrayOutputStream();
    message(withBadHeight, 5, badHeightCap.toByteArray());
    try {
      ProfileInfoParser.parse(withBadHeight.toByteArray());
      throw new AssertionError("inverted bodyHeight accepted");
    } catch (java.io.IOException expected) {
      // fail closed
    }

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
