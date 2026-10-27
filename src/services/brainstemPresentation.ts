import type { BrainstemSnapshot } from './brainstemReadOnly';

// Presentation only: a successful diagnostic read never grants command authority.
export function presentBrainstemSnapshot(snapshot: BrainstemSnapshot) {
  const states: Record<string, string> = {
    CMS_STATE_KIND_ZERO: '初始化', CMS_STATE_KIND_GROUNDED: '趴下',
    CMS_STATE_KIND_STANDING: '站立', CMS_STATE_KIND_WALKING: '行走',
    CMS_STATE_KIND_TRANSITIONING: '姿态切换中',
  };
  const transitions: Record<string, string> = {
    CMS_TRANSITION_KIND_NONE: '无', CMS_TRANSITION_KIND_STAND_UP: '起立',
    CMS_TRANSITION_KIND_SIT_DOWN: '趴下', CMS_TRANSITION_KIND_GESTURE: '动作切换',
  };
  const owners: Record<string, string> = {
    CONTROL_OWNER_NONE: '无', CONTROL_OWNER_GRPC: 'gRPC 客户端（不代表本 App）',
    CONTROL_OWNER_YUNZHUO: '云卓遥控器',
  };
  return {
    state: states[snapshot.state.kind] ?? '未知',
    transition: transitions[snapshot.state.transition] ?? '未知',
    owner: owners[snapshot.control.owner] ?? '未知',
    scope: snapshot.transport === 'local-insecure'
      ? '本地联调，未验证真机' : '远程只读，未验证设备身份',
    // Neither motor enablement nor a gRPC owner is permission for this app.
    authority: '本 App 未获取控制权，运动控制保持锁定',
  };
}
