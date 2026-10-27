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

/** Bounded, read-only projection of the real brainstem.api.v1 ControlStatus wire contract.
 * Never retains owner_id, gesture_name, sequence/counters or control tokens.
 * Proto3 absent scalars/messages use their declared zero defaults. Unknown fields are skipped;
 * malformed wire values, unsupported groups, duplicate known fields and future enums fail closed.
 */
public final class ControlStatusParser {
  public static final int MAX_BYTES = 64 * 1024;
  private static final String[] KINDS = {"zero", "grounded", "standing", "walking", "transitioning"};
  private static final String[] TRANSITIONS = {"none", "stand_up", "sit_down", "gesture"};
  private static final String[] OWNERS = {"none", "grpc", "yunzhuo"};

  private ControlStatusParser() {}

  public static byte[] readBounded(InputStream input) throws IOException {
    ByteArrayOutputStream out = new ByteArrayOutputStream();
    byte[] chunk = new byte[1024];
    int count;
    while ((count = input.read(chunk)) != -1) {
      if (count == 0) throw new IOException("Invalid status stream");
      if (out.size() + count > MAX_BYTES) throw new IOException("Status exceeds limit");
      out.write(chunk, 0, count);
    }
    return out.toByteArray();
  }

  public static Map<String, Object> parse(byte[] bytes) throws IOException {
    if (bytes == null || bytes.length > MAX_BYTES) throw invalid();
    Reader r = new Reader(bytes, 0, bytes.length);
    String kind = KINDS[0], transition = TRANSITIONS[0], owner = OWNERS[0];
    boolean enabled = false, fault = false, lease = false, ready = false;
    int seen = 0;
    while (r.hasNext()) {
      int tag = r.tag(), field = tag >>> 3, wire = tag & 7;
      if (field <= 12) {
        int flag = 1 << field;
        if ((seen & flag) != 0) throw invalid();
        seen |= flag;
      }
      switch (field) {
        case 1: {
          r.wire(wire, 2);
          Reader fsm = r.message();
          int fsmSeen = 0;
          while (fsm.hasNext()) {
            int ft = fsm.tag(), ff = ft >>> 3, fw = ft & 7;
            if (ff <= 3) {
              int flag = 1 << ff;
              if ((fsmSeen & flag) != 0) throw invalid();
              fsmSeen |= flag;
            }
            if (ff == 1) { fsm.wire(fw, 0); kind = KINDS[fsm.enumeration(KINDS.length)]; }
            else if (ff == 2) { fsm.wire(fw, 0); transition = TRANSITIONS[fsm.enumeration(TRANSITIONS.length)]; }
            else if (ff == 3) { fsm.wire(fw, 2); fsm.discardString(); }
            else fsm.skip(fw);
          }
          break;
        }
        case 2: r.wire(wire, 0); enabled = r.bool(); break;
        case 3: r.wire(wire, 0); owner = OWNERS[r.enumeration(OWNERS.length)]; break;
        case 4: r.wire(wire, 0); fault = r.bool(); break;
        case 5: r.wire(wire, 0); lease = r.bool(); break;
        case 6: r.wire(wire, 0); r.uint32(); break;
        case 7: case 11: case 12: r.wire(wire, 0); r.varint(); break;
        case 8: r.wire(wire, 0); r.enumeration(10); break;
        case 9: r.wire(wire, 0); ready = r.bool(); break;
        case 10: r.wire(wire, 2); r.discardString(); break;
        default: r.skip(wire);
      }
    }
    Map<String, Object> result = new LinkedHashMap<>();
    result.put("fsmKind", kind);
    result.put("transition", transition);
    result.put("motorOutputEnabled", enabled);
    result.put("owner", owner);
    result.put("criticalMotorFault", fault);
    result.put("grpcLeaseActive", lease);
    result.put("readyForWalk", ready);
    return result;
  }

  private static IOException invalid() { return new IOException("Invalid control status"); }

  private static final class Reader {
    private final byte[] bytes;
    private int pos;
    private final int end;
    Reader(byte[] bytes, int start, int end) { this.bytes = bytes; pos = start; this.end = end; }
    boolean hasNext() { return pos < end; }
    void wire(int actual, int expected) throws IOException { if (actual != expected) throw invalid(); }
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
      long v = varint();
      if (v < 0 || v > 0xffffffffL) throw invalid();
      return v;
    }
    int tag() throws IOException {
      long v = uint32();
      if ((v >>> 3) == 0 || (v >>> 3) > 0x1fffffffL) throw invalid();
      return (int) v;
    }
    int enumeration(int count) throws IOException {
      long value = varint();
      if (value < 0 || value >= count) throw invalid();
      return (int) value;
    }
    boolean bool() throws IOException { return enumeration(2) == 1; }
    int length() throws IOException {
      long size = uint32();
      if (size > end - pos) throw invalid();
      return (int) size;
    }
    Reader message() throws IOException {
      int size = length();
      Reader nested = new Reader(bytes, pos, pos + size);
      pos += size;
      return nested;
    }
    void discardString() throws IOException {
      int size = length();
      try {
        StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT)
          .onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(bytes, pos, size));
      } catch (CharacterCodingException e) { throw invalid(); }
      pos += size;
    }
    void advance(int count) throws IOException {
      if (count > end - pos) throw invalid();
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
