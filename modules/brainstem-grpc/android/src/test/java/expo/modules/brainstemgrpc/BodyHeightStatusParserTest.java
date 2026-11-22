package expo.modules.brainstemgrpc;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.Map;

/** Standalone JVM checks for BodyHeightStatus protobuf decoding and safety bounds. */
public final class BodyHeightStatusParserTest {
  private static void check(boolean condition, String message) {
    if (!condition) throw new AssertionError(message);
  }

  private static void varint(ByteArrayOutputStream out, long value) {
    while ((value & ~0x7fL) != 0) {
      out.write((int) ((value & 0x7fL) | 0x80L));
      value >>>= 7;
    }
    out.write((int) value);
  }

  private static void boolField(ByteArrayOutputStream out, int field, long value) {
    varint(out, (long) field << 3);
    varint(out, value);
  }

  private static void doubleField(ByteArrayOutputStream out, int field, double value) {
    varint(out, ((long) field << 3) | 1L);
    byte[] raw = ByteBuffer.allocate(8).order(ByteOrder.LITTLE_ENDIAN).putDouble(value).array();
    out.write(raw, 0, raw.length);
  }

  private static void fail(RunnableWithIO action, String message) {
    try {
      action.run();
    } catch (IOException expected) {
      return;
    }
    throw new AssertionError(message);
  }

  private interface RunnableWithIO {
    void run() throws IOException;
  }

  public static void main(String[] args) throws Exception {
    // 1. Empty proto3 message defaults
    Map<String, Object> defaults = BodyHeightStatusParser.parse(new byte[0]);
    check(Boolean.FALSE.equals(defaults.get("supported")), "default supported");
    check(Double.valueOf(0.0).equals(defaults.get("currentHeightM")), "default currentHeightM");
    check(Double.valueOf(0.0).equals(defaults.get("targetHeightM")), "default targetHeightM");
    check(Double.valueOf(0.0).equals(defaults.get("minHeightM")), "default minHeightM");
    check(Double.valueOf(0.0).equals(defaults.get("maxHeightM")), "default maxHeightM");
    check(Double.valueOf(0.0).equals(defaults.get("rateMps")), "default rateMps");

    // 2. Full live active BodyHeightStatus + unknown field skip
    ByteArrayOutputStream full = new ByteArrayOutputStream();
    boolField(full, 1, 1);
    doubleField(full, 2, 0.375);
    doubleField(full, 3, 0.42);
    doubleField(full, 4, 0.25);
    doubleField(full, 5, 0.50);
    doubleField(full, 6, 0.05);
    varint(full, (99L << 3) | 0L);
    varint(full, 7);
    byte[] encoded = full.toByteArray();
    check(BodyHeightStatusParser.readBounded(new ByteArrayInputStream(encoded)).length == encoded.length, "readBounded");
    Map<String, Object> parsed = BodyHeightStatusParser.parse(encoded);
    check(Boolean.TRUE.equals(parsed.get("supported")), "supported");
    check(Math.abs((Double) parsed.get("currentHeightM") - 0.375) < 1e-9, "currentHeightM");
    check(Math.abs((Double) parsed.get("targetHeightM") - 0.42) < 1e-9, "targetHeightM");
    check(Math.abs((Double) parsed.get("minHeightM") - 0.25) < 1e-9, "minHeightM");
    check(Math.abs((Double) parsed.get("maxHeightM") - 0.50) < 1e-9, "maxHeightM");
    check(Math.abs((Double) parsed.get("rateMps") - 0.05) < 1e-9, "rateMps");

    // 3. Inactive status with advertised robot limits
    ByteArrayOutputStream inactive = new ByteArrayOutputStream();
    doubleField(inactive, 4, 0.25);
    doubleField(inactive, 5, 0.50);
    doubleField(inactive, 6, 0.05);
    Map<String, Object> parsedInactive = BodyHeightStatusParser.parse(inactive.toByteArray());
    check(Boolean.FALSE.equals(parsedInactive.get("supported")), "inactive supported");
    check(Math.abs((Double) parsedInactive.get("minHeightM") - 0.25) < 1e-9, "inactive min");
    check(Math.abs((Double) parsedInactive.get("maxHeightM") - 0.50) < 1e-9, "inactive max");

    // 4. Malformed / duplicate / out-of-bounds / inverted range rejections
    fail(() -> BodyHeightStatusParser.parse(null), "null accepted");
    fail(() -> BodyHeightStatusParser.parse(new byte[BodyHeightStatusParser.MAX_BYTES + 1]), "oversized accepted");
    fail(() -> BodyHeightStatusParser.readBounded(new ByteArrayInputStream(new byte[BodyHeightStatusParser.MAX_BYTES + 1])), "oversized stream accepted");

    ByteArrayOutputStream badBool = new ByteArrayOutputStream();
    boolField(badBool, 1, 2);
    fail(() -> BodyHeightStatusParser.parse(badBool.toByteArray()), "non-bool accepted");

    ByteArrayOutputStream dupField = new ByteArrayOutputStream();
    doubleField(dupField, 2, 0.3);
    doubleField(dupField, 2, 0.4);
    fail(() -> BodyHeightStatusParser.parse(dupField.toByteArray()), "duplicate accepted");

    ByteArrayOutputStream wrongWire = new ByteArrayOutputStream();
    varint(wrongWire, (2L << 3) | 0L);
    varint(wrongWire, 1);
    fail(() -> BodyHeightStatusParser.parse(wrongWire.toByteArray()), "wrong wire accepted");

    ByteArrayOutputStream nanValue = new ByteArrayOutputStream();
    doubleField(nanValue, 2, Double.NaN);
    fail(() -> BodyHeightStatusParser.parse(nanValue.toByteArray()), "NaN accepted");

    ByteArrayOutputStream negValue = new ByteArrayOutputStream();
    doubleField(negValue, 3, -0.1);
    fail(() -> BodyHeightStatusParser.parse(negValue.toByteArray()), "negative accepted");

    ByteArrayOutputStream hugeHeight = new ByteArrayOutputStream();
    doubleField(hugeHeight, 5, 5.1);
    fail(() -> BodyHeightStatusParser.parse(hugeHeight.toByteArray()), "excessive height accepted");

    ByteArrayOutputStream hugeRate = new ByteArrayOutputStream();
    doubleField(hugeRate, 6, 10.1);
    fail(() -> BodyHeightStatusParser.parse(hugeRate.toByteArray()), "excessive rate accepted");

    ByteArrayOutputStream inverted = new ByteArrayOutputStream();
    doubleField(inverted, 4, 0.50);
    doubleField(inverted, 5, 0.25);
    fail(() -> BodyHeightStatusParser.parse(inverted.toByteArray()), "inverted range accepted");

    fail(() -> BodyHeightStatusParser.parse(new byte[] { 0x11, 0x00, 0x01 }), "truncated fixed64 accepted");

    System.out.println("PASS: body height status protobuf projections and bounds");
  }
}
