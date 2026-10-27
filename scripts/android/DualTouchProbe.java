import android.os.SystemClock;
import android.view.InputDevice;
import android.view.InputEvent;
import android.view.MotionEvent;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.lang.reflect.Method;

/** ADB-shell-only native input probe. Never included in or called by the app. */
public final class DualTouchProbe {
  private static Object manager;
  private static Method inject;
  private static long downTime;
  private static int[] ids = new int[0];
  private static float[] xy = new float[0];

  private static void event(int action, int[] eventIds, float[] points) throws Exception {
    MotionEvent.PointerProperties[] properties = new MotionEvent.PointerProperties[eventIds.length];
    MotionEvent.PointerCoords[] coords = new MotionEvent.PointerCoords[eventIds.length];
    for (int i=0; i<eventIds.length; i++) {
      properties[i] = new MotionEvent.PointerProperties();
      properties[i].id = eventIds[i];
      properties[i].toolType = MotionEvent.TOOL_TYPE_FINGER;
      coords[i] = new MotionEvent.PointerCoords();
      coords[i].x = points[i*2]; coords[i].y = points[i*2+1];
      coords[i].pressure = 1f; coords[i].size = 0.1f;
    }
    MotionEvent motion = MotionEvent.obtain(downTime, SystemClock.uptimeMillis(), action,
      eventIds.length, properties, coords, 0, 0, 1f, 1f, 0, 0, InputDevice.SOURCE_TOUCHSCREEN, 0);
    try {
      if (!Boolean.TRUE.equals(inject.invoke(manager, motion, 2))) throw new IllegalStateException("Input injection rejected");
    } finally { motion.recycle(); }
  }

  public static void main(String[] args) throws Exception {
    Class<?> type = Class.forName("android.hardware.input.InputManagerGlobal");
    manager = type.getMethod("getInstance").invoke(null);
    inject = type.getMethod("injectInputEvent", InputEvent.class, int.class);
    BufferedReader input = new BufferedReader(new InputStreamReader(System.in));
    System.out.println("READY native MotionEvent probe");
    System.out.flush();
    try {
      for (String line; (line=input.readLine())!=null;) {
        String[] parts=line.trim().split("\\s+");
        if (parts[0].equals("quit")) break;
        if (parts[0].equals("down")) {
          if (ids.length!=0) throw new IllegalStateException("Already touching");
          ids=new int[]{0}; xy=new float[]{Float.parseFloat(parts[1]),Float.parseFloat(parts[2])};
          downTime=SystemClock.uptimeMillis(); event(MotionEvent.ACTION_DOWN,ids,xy);
        } else if (parts[0].equals("add")) {
          if (ids.length!=1) throw new IllegalStateException("Expected first touch");
          ids=new int[]{0,1}; xy=new float[]{xy[0],xy[1],Float.parseFloat(parts[1]),Float.parseFloat(parts[2])};
          event(MotionEvent.ACTION_POINTER_DOWN | (1 << MotionEvent.ACTION_POINTER_INDEX_SHIFT),ids,xy);
        } else if (parts[0].equals("move")) {
          if (ids.length==0 || parts.length!=1+ids.length*2) throw new IllegalArgumentException("Expected all active coordinates");
          for(int i=0;i<xy.length;i++) xy[i]=Float.parseFloat(parts[i+1]);
          event(MotionEvent.ACTION_MOVE,ids,xy);
        } else if (parts[0].equals("up")) {
          int target=Integer.parseInt(parts[1]), index=-1;
          for(int i=0;i<ids.length;i++) if(ids[i]==target) index=i;
          if(index<0) throw new IllegalArgumentException("Unknown pointer");
          event(ids.length==1?MotionEvent.ACTION_UP:MotionEvent.ACTION_POINTER_UP|(index<<MotionEvent.ACTION_POINTER_INDEX_SHIFT),ids,xy);
          if(ids.length==1){ids=new int[0];xy=new float[0];}
          else {int keep=1-index;ids=new int[]{ids[keep]};xy=new float[]{xy[keep*2],xy[keep*2+1]};}
        } else if (parts[0].equals("cancel")) {
          if(ids.length>0) event(MotionEvent.ACTION_CANCEL,ids,xy);
          ids=new int[0];xy=new float[0];
        } else throw new IllegalArgumentException("Unknown command");
        System.out.println("OK "+line);System.out.flush();
      }
    } finally { if(ids.length>0) event(MotionEvent.ACTION_CANCEL,ids,xy); }
  }
}
