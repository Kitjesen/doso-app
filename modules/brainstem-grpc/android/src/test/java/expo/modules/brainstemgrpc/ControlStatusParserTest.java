package expo.modules.brainstemgrpc;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.Arrays;
import java.util.Map;

/** Standalone JVM tests run by scripts/brainstem-grpc-native.test.mjs; no Android runtime. */
public final class ControlStatusParserTest {
  private static byte[] bytes(int... values) {
    byte[] result = new byte[values.length];
    for (int i = 0; i < values.length; i++) result[i] = (byte) values[i];
    return result;
  }
  private static void check(boolean value) { if (!value) throw new AssertionError("fixture mismatch"); }
  private static void rejected(byte[] value) throws Exception {
    try { ControlStatusParser.parse(value); throw new AssertionError("accepted malformed fixture"); }
    catch (IOException expected) { /* fixed safe message */ }
  }
  public static void main(String[] args) throws Exception {
    String[] kinds = {"zero", "grounded", "standing", "walking", "transitioning"};
    String[] transitions = {"none", "stand_up", "sit_down", "gesture"};
    String[] owners = {"none", "grpc", "yunzhuo"};
    for (int k = 0; k < 5; k++) for (int t = 0; t < 4; t++) for (int o = 0; o < 3; o++) {
      // Real proto fields: fsm=1(kind=1, transition=2), enabled=2, owner=3,
      // fault=4, lease=5, ready=9, owner_id=10. owner_id must never escape.
      Map<String, Object> result = ControlStatusParser.parse(bytes(10,4,8,k,16,t,16,1,24,o,32,1,40,1,48,123,56,1,64,9,72,1,82,6,115,101,99,114,101,116,88,1,96,1));
      check(result.size() == 7 && result.get("fsmKind").equals(kinds[k]));
      check(result.get("transition").equals(transitions[t]) && result.get("owner").equals(owners[o]));
      for (String name : new String[]{"motorOutputEnabled", "criticalMotorFault", "grpcLeaseActive", "readyForWalk"}) check(Boolean.TRUE.equals(result.get(name)));
      check(!result.toString().contains("secret") && !result.containsKey("owner_id"));
    }
    Map<String,Object> defaults = ControlStatusParser.parse(bytes());
    check(defaults.get("fsmKind").equals("zero") && defaults.get("owner").equals("none"));
    check(Boolean.FALSE.equals(defaults.get("motorOutputEnabled")) && Boolean.FALSE.equals(defaults.get("readyForWalk")));
    check(defaults.equals(ControlStatusParser.parse(bytes(10,0))));
    check(defaults.equals(ControlStatusParser.parse(bytes(104,1,113,0,0,0,0,0,0,0,0,122,2,1,2,133,1,0,0,0,0))));
    ControlStatusParser.parse(bytes(56,255,255,255,255,255,255,255,255,255,1)); // uint64 max
    ControlStatusParser.parse(bytes(48,255,255,255,255,15)); // uint32 max
    for (byte[] bad : new byte[][] {
      bytes(0), bytes(8,0), bytes(10,3,8,1), bytes(10,2,8,5), bytes(10,2,16,4), bytes(24,3),
      bytes(16,2), bytes(32,2), bytes(40,2), bytes(72,2), bytes(64,10), bytes(16,128),
      bytes(16,255,255,255,255,255,255,255,255,255,2), bytes(16,1,16,0), bytes(10,4,8,1,8,2),
      bytes(82,1,255), bytes(10,3,26,1,255), bytes(48,128,128,128,128,16), bytes(107), bytes(108),
      bytes(105,1), bytes(109,1), bytes(106,5,1), bytes(255,255,255,255,255,1),
      bytes(10,1,0), new byte[65537]
    }) rejected(bad);
    byte[] largest = new byte[65536];
    // Unknown field 13, length 65532 + four-byte tag/length overhead = 65536.
    largest[0] = 106; largest[1] = (byte)252; largest[2] = (byte)255; largest[3] = 3;
    check(defaults.equals(ControlStatusParser.parse(largest)));
    check(Arrays.equals(largest, ControlStatusParser.readBounded(new ByteArrayInputStream(largest))));
    try { ControlStatusParser.readBounded(new ByteArrayInputStream(new byte[65537])); throw new AssertionError("unbounded stream"); }
    catch (IOException expected) { }
    System.out.println("PASS: 60 enum combinations, proto defaults, sensitive field omission, malformed and size fixtures");
  }
}
