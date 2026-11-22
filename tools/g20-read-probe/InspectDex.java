import java.io.*; import java.nio.*; import java.nio.charset.*; import java.util.*; import java.util.zip.*;
public class InspectDex {
  static int uleb(ByteBuffer b) { int v=0,s=0,n; do { n=b.get()&255; v|=(n&127)<<s; s+=7; } while((n&128)!=0); return v; }
  public static void main(String[] args) throws Exception {
    Set<String> wanted = new HashSet<>(Arrays.asList("Lcom/skydroid/rcsdk/RCSDKManager;","Lcom/skydroid/rcsdk/KeyManager;","Lcom/skydroid/rcsdk/SDKManagerCallBack;","Lcom/skydroid/rcsdk/internal/InternalKey;","Lcom/skydroid/rcsdk/key/RemoteControllerKey;","Lcom/skydroid/rcsdk/common/callback/CompletionCallbackWith;"));
    if (args.length > 1) wanted = new HashSet<>(Arrays.asList(args).subList(1, args.length));
    Set<String> found = new HashSet<>();
    try (ZipFile apk = new ZipFile(args[0])) {
      Enumeration<? extends ZipEntry> entries=apk.entries();
      while(entries.hasMoreElements()) { ZipEntry entry=entries.nextElement(); if(!entry.getName().matches("classes[0-9]*\\.dex")) continue;
        byte[] bytes=apk.getInputStream(entry).readAllBytes(); ByteBuffer b=ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN);
        int sc=b.getInt(56),so=b.getInt(60),tc=b.getInt(64),to=b.getInt(68),fc=b.getInt(80),fo=b.getInt(84),mc=b.getInt(88),mo=b.getInt(92),cc=b.getInt(96),co=b.getInt(100);
        String[] strings=new String[sc];
        for(int i=0;i<sc;i++) { int off=b.getInt(so+i*4); b.position(off); uleb(b); int start=b.position(),end=start; while(bytes[end]!=0)end++; strings[i]=new String(bytes,start,end-start,StandardCharsets.UTF_8); }
        String[] types=new String[tc]; for(int i=0;i<tc;i++) types[i]=strings[b.getInt(to+i*4)];
        for(int i=0;i<cc;i++) { String type=types[b.getInt(co+i*32)]; if(wanted.contains(type)) { found.add(type); System.out.println(entry.getName()+" CLASS_DEFINED "+type); } }
        for(int i=0;i<mc;i++) { String type=types[b.getShort(mo+i*8)&65535]; if(wanted.contains(type))System.out.println(entry.getName()+" METHOD "+type+" "+strings[b.getInt(mo+i*8+4)]); }
        for(int i=0;i<fc;i++) { String type=types[b.getShort(fo+i*8)&65535]; if(wanted.contains(type))System.out.println(entry.getName()+" FIELD "+type+" "+strings[b.getInt(fo+i*8+4)]); }
      }
    }
    for(String type:wanted)if(!found.contains(type))System.out.println("CLASS_NOT_DEFINED "+type);
  }
}
