import type { Session, User } from '@supabase/supabase-js';

import type { RobotModel } from '../types';

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Profile = {
  id: string;
  email: string;
  username: string;
  username_claimed_at: string | null;
  username_provenance: UsernameProvenance;
  display_name: string;
  avatar_url: string | null;
  app_role: AppRole;
  account_status: AccountStatus;
  suspended_at: string | null;
  suspension_reason: string | null;
  created_at: string;
  updated_at: string;
};

export type AppRole = 'user' | 'support' | 'admin';
export type AccountStatus = 'active' | 'suspended' | 'deleting';
export type UsernameProvenance =
  | 'registration'
  | 'manual_claim'
  | 'admin_verified'
  | 'legacy_inferred'
  | 'social_provisional';
export type AccountTerminalPlatform = 'android' | 'ios' | 'web' | 'windows' | 'macos' | 'linux' | 'unknown';

export type AccountTerminal = {
  id: string;
  user_id: string;
  auth_session_id: string;
  installation_id: string;
  platform: AccountTerminalPlatform;
  device_label: string;
  app_version: string | null;
  user_agent: string | null;
  first_seen_at: string;
  last_seen_at: string;
  revoked_at: string | null;
  revocation_reason: string | null;
};

export type AccountTerminalWithCurrent = Omit<AccountTerminal, 'user_id' | 'auth_session_id' | 'user_agent'> & {
  is_current: boolean;
};

export type ExternalIdentityKind = 'email' | 'apple' | 'wechat' | 'qq' | 'other';
export type ExternalIdentityStatus = 'active' | 'unlinked';

export type ExternalIdentitySummary = {
  registry_id: string;
  provider_key: string;
  kind: ExternalIdentityKind;
  email_verified: boolean;
  linked_at: string;
  provider_last_sign_in_at: string | null;
  last_observed_at: string;
  unlinked_at: string | null;
  status: ExternalIdentityStatus;
};

export type DeviceConnectionStatus = 'offline' | 'connecting' | 'online' | 'error';

export type Device = {
  id: string;
  owner_id: string | null;
  model_code: string;
  display_name: string;
  category: RobotModel['category'];
  environment: RobotModel['environment'];
  serial_number: string | null;
  connection_status: DeviceConnectionStatus;
  safety_lock: boolean;
  alerts_enabled: boolean;
  battery_percent: number | null;
  firmware_version: string | null;
  runtime_hours: number;
  last_seen_at: string | null;
  is_demo: boolean;
  created_at: string;
  updated_at: string;
};

export type DeviceSettingsUpdate = Partial<
  Pick<Device, 'display_name' | 'alerts_enabled'>
>;

export type RegisterInput = {
  email: string;
  password: string;
  username?: string;
  displayName?: string;
  emailRedirectTo?: string;
};

export type LoginInput = {
  email: string;
  password: string;
};

export type AuthResult = {
  user: User | null;
  session: Session | null;
};

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: {
          id: string;
          email: string;
          username: string;
          username_claimed_at?: string | null;
          username_provenance: UsernameProvenance;
          display_name?: string | null;
          avatar_url?: string | null;
          app_role?: AppRole;
          account_status?: AccountStatus;
          suspended_at?: string | null;
          suspension_reason?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Pick<Profile, 'display_name'>>;
        Relationships: [];
      };
      account_terminals: {
        Row: AccountTerminal;
        Insert: {
          id?: string;
          user_id: string;
          auth_session_id: string;
          installation_id: string;
          platform: AccountTerminalPlatform;
          device_label: string;
          app_version?: string | null;
          user_agent?: string | null;
          first_seen_at?: string;
          last_seen_at?: string;
          revoked_at?: string | null;
          revocation_reason?: string | null;
        };
        Update: Partial<Omit<AccountTerminal, 'id' | 'user_id' | 'auth_session_id' | 'first_seen_at'>>;
        Relationships: [];
      };
      devices: {
        Row: Device;
        Insert: {
          id?: string;
          owner_id?: string | null;
          model_code: string;
          display_name: string;
          category: RobotModel['category'];
          environment: RobotModel['environment'];
          serial_number?: string | null;
          connection_status?: DeviceConnectionStatus;
          safety_lock?: boolean;
          alerts_enabled?: boolean;
          battery_percent?: number | null;
          firmware_version?: string | null;
          runtime_hours?: number;
          last_seen_at?: string | null;
          is_demo?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: DeviceSettingsUpdate;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      prepare_my_profile_avatar_cleanup: {
        Args: { p_expected_user_id: string; p_object_path: string };
        Returns: Json;
      };
      update_my_profile: {
        Args: {
          p_expected_user_id: string;
          p_username: string;
          p_display_name: string;
          p_avatar_action: 'keep' | 'remove' | 'replace';
          p_avatar_path: string | null;
        };
        Returns: Profile;
      };
      claim_username: {
        Args: { p_username: string };
        Returns: string;
      };
      register_account_terminal: {
        Args: {
          p_installation_id: string;
          p_platform: AccountTerminalPlatform;
          p_device_label: string;
          p_app_version: string | null;
          p_user_agent: string | null;
        };
        Returns: AccountTerminal;
      };
      heartbeat_current_terminal: {
        Args: Record<PropertyKey, never>;
        Returns: AccountTerminal;
      };
      revoke_account_terminal: {
        Args: { p_terminal_id: string; p_reason: string };
        Returns: number;
      };
      revoke_current_terminal: {
        Args: { p_reason: string };
        Returns: number;
      };
      revoke_other_terminals: {
        Args: { p_reason: string };
        Returns: number;
      };
      revoke_all_terminals: {
        Args: { p_reason: string };
        Returns: number;
      };
      list_my_login_methods: {
        Args: Record<PropertyKey, never>;
        Returns: ExternalIdentitySummary[];
      };
    };
    Enums: {
      username_provenance: UsernameProvenance;
    };
    CompositeTypes: Record<string, never>;
  };
};
