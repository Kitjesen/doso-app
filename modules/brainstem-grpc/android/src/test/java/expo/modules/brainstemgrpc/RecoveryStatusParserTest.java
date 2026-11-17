package expo.modules.brainstemgrpc;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;

/** Standalone JVM checks for recovery status and profile mode capabilities. */
public final class RecoveryStatusParserTest {
  private static void check(boolean value) { if (!value) throw new AssertionError("fixture mismatch"); }
  private static void varint(ByteArrayOutputStream out, int value) {
    while ((value & ~0x7f) != 0) { out.write((value & 0x7f) | 0x80); value >>>= 7; }
    out.write(value);
  }
  private static void tag(ByteArrayOutputStream out, int field, int wire) { varint(out, (field << 3) | wire); }
  private static void text(ByteArrayOutputStream out, int field, String value) {
    byte[] bytes = value.getBytes(StandardCharsets.UTF_8);
    tag(out, field, 2);
    varint(out, bytes.length);
    out.write(bytes, 0, bytes.length);
  }
  private static void bool(ByteArrayOutputStream out, int field, boolean value) {
    tag(out, field, 0);
    out.write(value ? 1 : 0);
  }
  public static void main(String[] args) throws Exception {
    ByteArrayOutputStream status = new ByteArrayOutputStream();
    tag(status, 1, 0); outEnum(status, 5);
    bool(status, 2, true);
    bool(status, 3, true);
    bool(status, 4, false);
    bool(status, 5, true);
    bool(status, 6, true);
    text(status, 7, "recovery");
    tag(status, 8, 0); outEnum(status, 3);
    text(status, 9, "sequence");
    Map<String, Object> parsed = RecoveryStatusParser.parse(status.toByteArray());
    check("stable-stand".equals(parsed.get("phase")));
    check(Boolean.TRUE.equals(parsed.get("sessionSelected")));
    check(Boolean.FALSE.equals(parsed.get("enableSequenceVerified")));
    check(Boolean.TRUE.equals(parsed.get("stableStand")));
    check(Boolean.TRUE.equals(parsed.get("locomotionAvailable")));
    check("enable-sequence-unverified".equals(parsed.get("reason")));
    Map<String, Object> defaults = RecoveryStatusParser.parse(new byte[0]);
    check("unspecified".equals(defaults.get("phase")) && Boolean.FALSE.equals(defaults.get("modelConfigured")));
    try { RecoveryStatusParser.parse(new byte[] { 8, 9 }); throw new AssertionError("accepted unknown phase"); }
    catch (IOException expected) { }

    ByteArrayOutputStream capability = new ByteArrayOutputStream();
    text(capability, 1, "recovery");
    tag(capability, 2, 0); outEnum(capability, 2);
    text(capability, 3, "摔倒恢复");
    bool(capability, 4, true);
    text(capability, 5, "");
    ByteArrayOutputStream profile = new ByteArrayOutputStream();
    text(profile, 1, "flat");
    text(profile, 4, "平地");
    tag(profile, 5, 2);
    varint(profile, capability.size());
    profile.write(capability.toByteArray(), 0, capability.size());
    text(profile, 6, "recovery");
    Map<String, Object> parsedProfile = ProfileInfoParser.parse(profile.toByteArray());
    @SuppressWarnings("unchecked") List<Map<String, Object>> modes = (List<Map<String, Object>>) parsedProfile.get("modeCapabilities");
    check(modes.size() == 1 && "recovery".equals(modes.get(0).get("id")));
    check("recovery-action".equals(modes.get(0).get("kind")) && Boolean.TRUE.equals(modes.get(0).get("available")));
    check("recovery".equals(parsedProfile.get("activeModeId")));
    Map<String, Object> oldProfile = ProfileInfoParser.parse(new byte[0]);
    check(!oldProfile.containsKey("modeCapabilities") && !oldProfile.containsKey("activeModeId"));
    System.out.println("PASS: recovery status and profile mode capabilities");
  }
  private static void outEnum(ByteArrayOutputStream out, int value) { out.write(value); }
}
