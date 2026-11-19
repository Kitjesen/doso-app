import java.io.*;
import java.util.zip.*;
public class InspectSdk {
  public static void main(String[] args) throws Exception {
    try (ZipFile aar = new ZipFile(args[0]); ZipInputStream jar = new ZipInputStream(aar.getInputStream(aar.getEntry("classes.jar")))) {
      ZipEntry entry;
      while ((entry = jar.getNextEntry()) != null) if (entry.getName().matches("com/skydroid/rcsdk/(RCSDKManager|KeyManager|SDKManagerCallBack|internal/InternalKey|key/RemoteControllerKey|common/callback/CompletionCallbackWith)\\.class")) {
        DataInputStream in = new DataInputStream(new ByteArrayInputStream(jar.readAllBytes()));
        in.skipBytes(8); String[] constants = new String[in.readUnsignedShort()];
        for (int i=1;i<constants.length;i++) switch(in.readUnsignedByte()) {
          case 1: constants[i]=in.readUTF(); break;
          case 3: case 4: in.skipBytes(4); break;
          case 5: case 6: in.skipBytes(8); i++; break;
          case 7: case 8: case 16: case 19: case 20: in.skipBytes(2); break;
          case 9: case 10: case 11: case 12: case 17: case 18: in.skipBytes(4); break;
          case 15: in.skipBytes(3); break;
          default: throw new IOException("constant tag");
        }
        in.skipBytes(6); in.skipBytes(in.readUnsignedShort()*2);
        for (int group=0;group<2;group++) for (int n=in.readUnsignedShort();n>0;n--) {
          int access=in.readUnsignedShort(); String name=constants[in.readUnsignedShort()], desc=constants[in.readUnsignedShort()];
          System.out.println(entry.getName()+" "+(group==0?"FIELD":"METHOD")+" "+Integer.toHexString(access)+" "+name+" "+desc);
          for (int a=in.readUnsignedShort();a>0;a--) { in.readUnsignedShort(); in.skipBytes(in.readInt()); }
        }
      }
    }
  }
}
