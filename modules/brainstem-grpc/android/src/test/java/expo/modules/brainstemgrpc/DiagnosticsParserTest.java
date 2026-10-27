package expo.modules.brainstemgrpc;

import java.io.ByteArrayOutputStream;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;

public final class DiagnosticsParserTest {
  private static void check(boolean condition, String message) {
    if (!condition) throw new AssertionError(message);
  }

  private static void varint(ByteArrayOutputStream out, long value) {
    while ((value & ~0x7fL) != 0) { out.write((int) (value & 0x7f) | 0x80); value >>>= 7; }
    out.write((int) value);
  }

  private static void fieldDouble(ByteArrayOutputStream out, int number, double value) {
    out.write(number << 3 | 1);
    byte[] bytes = ByteBuffer.allocate(8).order(ByteOrder.LITTLE_ENDIAN).putDouble(value).array();
    out.writeBytes(bytes);
  }

  private static void fieldBytes(ByteArrayOutputStream out, int number, byte[] bytes) {
    out.write(number << 3 | 2); varint(out, bytes.length); out.writeBytes(bytes);
  }

  public static void main(String[] args) throws Exception {
    ByteArrayOutputStream voltage = new ByteArrayOutputStream();
    fieldDouble(voltage, 1, 24.5);
    fieldDouble(voltage, 1, 24.7);
    Map<String, Object> voltageResult = VoltageParser.parse(voltage.toByteArray());
    check(((List<?>) voltageResult.get("values")).size() == 2, "voltage values");

    ByteArrayOutputStream motor = new ByteArrayOutputStream();
    varint(motor, 1 << 3); varint(motor, 0);
    varint(motor, 2 << 3); varint(motor, 1);
    varint(motor, 3 << 3); varint(motor, 0);
    fieldDouble(motor, 4, 42.0); fieldDouble(motor, 5, 24.5);
    fieldDouble(motor, 6, 0.25); fieldDouble(motor, 7, 0.5); fieldDouble(motor, 8, 1.2);
    ByteArrayOutputStream status = new ByteArrayOutputStream();
    fieldBytes(status, 1, motor.toByteArray());
    Map<String, Object> motorResult = MotorStatusParser.parse(status.toByteArray());
    check(((List<?>) motorResult.get("motors")).size() == 1, "motor record");
    Map<?, ?> first = (Map<?, ?>) ((List<?>) motorResult.get("motors")).get(0);
    check(Boolean.TRUE.equals(first.get("online")), "motor online");
    check(Math.abs((Double) first.get("temperatureC") - 42.0) < 0.001, "temperature");
    System.out.println("PASS: voltage and motor diagnostics protobuf projections");
  }
}
