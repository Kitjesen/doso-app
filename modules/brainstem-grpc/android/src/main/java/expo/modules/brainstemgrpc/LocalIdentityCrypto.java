package expo.modules.brainstemgrpc;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import android.util.Base64;
import java.security.MessageDigest;
import java.security.PrivateKey;
import java.security.PublicKey;
import java.security.Signature;
import java.security.cert.CertificateFactory;
import java.security.cert.X509Certificate;
import java.util.Arrays;
import java.util.Collection;
import java.util.List;
import java.util.HashSet;
import java.util.Set;
import javax.security.auth.x500.X500Principal;

/** Public PKCS#10 and certificate checks; the private key is only used by Signature. */
final class LocalIdentityCrypto {
  static final int MAX_BYTES = 64 * 1024;

  static String sha256(byte[] publicBytes) throws Exception {
    byte[] digest = MessageDigest.getInstance("SHA-256").digest(publicBytes);
    StringBuilder text = new StringBuilder(64);
    for (byte value : digest) text.append(String.format(java.util.Locale.ROOT, "%02x", value & 255));
    return text.toString();
  }

  static String csr(PublicKey publicKey, PrivateKey privateKey) throws Exception {
    if (!"EC".equals(publicKey.getAlgorithm())) throw new IllegalArgumentException("EC identity required");
    byte[] request = der(0x30, join(new byte[] {2, 1, 0},
      new X500Principal("CN=DOSO local client").getEncoded(), publicKey.getEncoded(), new byte[] {(byte) 0xa0, 0}));
    Signature signer = Signature.getInstance("SHA256withECDSA");
    signer.initSign(privateKey); signer.update(request);
    byte[] algorithm = new byte[] {0x30, 0x0a, 6, 8, 0x2a, (byte) 0x86, 0x48, (byte) 0xce, 0x3d, 4, 3, 2};
    byte[] encoded = der(0x30, join(request, algorithm, der(3, join(new byte[] {0}, signer.sign()))));
    String base64 = Base64.encodeToString(encoded, Base64.NO_WRAP);
    return "-----BEGIN CERTIFICATE REQUEST-----\n" + base64.replaceAll("(.{64})", "$1\n")
      + "\n-----END CERTIFICATE REQUEST-----\n";
  }

  static X509Certificate certificate(String pem) throws Exception {
    if (pem == null || pem.length() > MAX_BYTES) throw new IllegalArgumentException("certificate size");
    String text = pem.trim();
    if (!text.matches("-----BEGIN CERTIFICATE-----[\\r\\n]+[A-Za-z0-9+/=\\r\\n]+[\\r\\n]+-----END CERTIFICATE-----")) {
      throw new IllegalArgumentException("one public certificate required");
    }
    String body = text.substring("-----BEGIN CERTIFICATE-----".length(), text.length() - "-----END CERTIFICATE-----".length()).replaceAll("[\\r\\n]", "");
    byte[] bytes = Base64.decode(body, Base64.NO_WRAP);
    X509Certificate result = (X509Certificate) CertificateFactory.getInstance("X.509").generateCertificate(new ByteArrayInputStream(bytes));
    if (!Arrays.equals(bytes, result.getEncoded())) throw new IllegalArgumentException("trailing certificate data");
    return result;
  }

  static X509Certificate[] approvedChain(String clientPem, String caPem, PublicKey key, String approvedCaSha256, String approvedSan) throws Exception {
    X509Certificate client = certificate(clientPem), ca = certificate(caPem);
    client.checkValidity(); ca.checkValidity();
    if (client.hasUnsupportedCriticalExtension() || ca.hasUnsupportedCriticalExtension()) throw new IllegalArgumentException("unsupported critical extension");
    criticalExtensions(client, "2.5.29.19", "2.5.29.15", "2.5.29.37", "2.5.29.17");
    criticalExtensions(ca, "2.5.29.19", "2.5.29.15");
    if (!sha256(ca.getEncoded()).equals(approvedCaSha256) || !Arrays.equals(client.getPublicKey().getEncoded(), key.getEncoded())) {
      throw new IllegalArgumentException("identity mismatch");
    }
    boolean[] clientUsage = client.getKeyUsage(), caUsage = ca.getKeyUsage();
    List<String> purposes = client.getExtendedKeyUsage();
    if (client.getBasicConstraints() >= 0 || clientUsage == null || clientUsage.length == 0 || !clientUsage[0]
        || clientUsage.length > 5 && clientUsage[5] || clientUsage.length > 6 && clientUsage[6]
        || purposes == null || purposes.size() != 1 || !purposes.contains("1.3.6.1.5.5.7.3.2")
        || ca.getBasicConstraints() < 0 || caUsage == null || caUsage.length <= 5 || !caUsage[5]
        || !ca.getIssuerX500Principal().equals(ca.getSubjectX500Principal())
        || !client.getIssuerX500Principal().equals(ca.getSubjectX500Principal())) throw new IllegalArgumentException("certificate purpose");
    ca.verify(ca.getPublicKey()); client.verify(ca.getPublicKey());
    Collection<List<?>> sans = client.getSubjectAlternativeNames();
    int colon = approvedSan == null ? -1 : approvedSan.indexOf(':');
    if (colon < 1 || sans == null || sans.size() != 1) throw new IllegalArgumentException("certificate SAN");
    String kind = approvedSan.substring(0, colon), value = approvedSan.substring(colon + 1);
    int type = "URI".equals(kind) ? 6 : "DNS".equals(kind) ? 2 : "IP".equals(kind) ? 7 : -1;
    List<?> san = sans.iterator().next();
    if (type < 0 || value.isEmpty() || san.size() != 2 || !Integer.valueOf(type).equals(san.get(0)) || !value.equals(san.get(1))) {
      throw new IllegalArgumentException("certificate SAN");
    }
    return new X509Certificate[] {client, ca};
  }

  private static void criticalExtensions(X509Certificate certificate, String... understood) {
    Set<String> critical = certificate.getCriticalExtensionOIDs();
    if (critical != null && !new HashSet<>(Arrays.asList(understood)).containsAll(critical)) throw new IllegalArgumentException("unhandled critical extension");
  }

  private static byte[] der(int tag, byte[] value) {
    ByteArrayOutputStream out = new ByteArrayOutputStream(); out.write(tag);
    if (value.length < 128) out.write(value.length);
    else if (value.length <= 255) { out.write(0x81); out.write(value.length); }
    else { if (value.length > 65535) throw new IllegalArgumentException("DER size"); out.write(0x82); out.write(value.length >> 8); out.write(value.length); }
    out.write(value, 0, value.length); return out.toByteArray();
  }

  private static byte[] join(byte[]... values) {
    ByteArrayOutputStream out = new ByteArrayOutputStream();
    for (byte[] value : values) out.write(value, 0, value.length);
    return out.toByteArray();
  }
}
