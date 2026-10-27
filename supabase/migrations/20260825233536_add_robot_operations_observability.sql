create index device_command_outbox_operations_idx
  on private.device_command_outbox(status, updated_at, command_id);

create index device_command_ack_events_rejected_operations_idx
  on private.device_command_ack_events(received_at, projection_reason)
  where not applied;

create index devices_trusted_shadow_operations_idx
  on public.devices(trusted_telemetry_received_at, trusted_telemetry_captured_at)
  where not is_demo
    and owner_id is not null
    and robot_lifecycle = 'owned'
    and robot_public_key_fingerprint is not null
    and robot_active_boot_id is not null;

create function public.get_robot_operations_observability(
  p_window_seconds integer default 3600,
  p_shadow_stale_seconds integer default 120
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_sampled_at timestamptz := transaction_timestamp();
  v_window_start timestamptz;
  v_shadow_cutoff timestamptz;
  v_queued_current bigint;
  v_queued_created_in_window bigint;
  v_queued_older_than_window bigint;
  v_queued_oldest_at timestamptz;
  v_leased bigint;
  v_leased_overdue bigint;
  v_dispatching bigint;
  v_dispatching_overdue bigint;
  v_published bigint;
  v_published_overdue bigint;
  v_delivery_unknown bigint;
  v_dead_letter bigint;
  v_revocation_pending bigint;
  v_ack_event_attempts bigint;
  v_ack_unknown_command bigint;
  v_ack_device_not_owned bigint;
  v_ack_unsupported_command_projection bigint;
  v_ack_device_binding_mismatch bigint;
  v_ack_authorization_epoch_mismatch bigint;
  v_ack_boot_mismatch bigint;
  v_ack_clock_unavailable bigint;
  v_ack_clock_skew bigint;
  v_ack_frame_expired bigint;
  v_ack_command_expired bigint;
  v_ack_illegal_ack_transition bigint;
  v_ack_projection_conflict bigint;
  v_ack_other bigint;
  v_shadow_eligible bigint;
  v_shadow_fresh bigint;
  v_shadow_stale bigint;
  v_shadow_missing bigint;
begin
  if p_window_seconds is null
     or p_window_seconds < 60
     or p_window_seconds > 604800
     or p_shadow_stale_seconds is null
     or p_shadow_stale_seconds < 60
     or p_shadow_stale_seconds > 86400 then
    raise exception 'invalid robot operations observability bounds'
      using errcode = '22023';
  end if;

  v_window_start := v_sampled_at - make_interval(secs => p_window_seconds);
  v_shadow_cutoff := v_sampled_at - make_interval(secs => p_shadow_stale_seconds);

  select
    count(*),
    count(*) filter (where c.created_at >= v_window_start),
    count(*) filter (where c.created_at < v_window_start),
    min(c.created_at)
  into
    v_queued_current,
    v_queued_created_in_window,
    v_queued_older_than_window,
    v_queued_oldest_at
  from private.device_command_outbox as o
  join public.device_commands as c on c.id = o.command_id
  where o.status = 'queued';

  select
    count(*) filter (where status = 'leased'),
    count(*) filter (where status = 'leased' and leased_until <= v_sampled_at),
    count(*) filter (where status = 'dispatching'),
    count(*) filter (where status = 'dispatching' and leased_until <= v_sampled_at),
    count(*) filter (where status = 'published'),
    count(*) filter (where status = 'published' and ack_deadline <= v_sampled_at),
    count(*) filter (where status = 'delivery_unknown'),
    count(*) filter (where status = 'dead_letter'),
    count(*) filter (where status = 'revocation_pending')
  into
    v_leased,
    v_leased_overdue,
    v_dispatching,
    v_dispatching_overdue,
    v_published,
    v_published_overdue,
    v_delivery_unknown,
    v_dead_letter,
    v_revocation_pending
  from private.device_command_outbox;

  select
    count(*),
    count(*) filter (where projection_reason = 'unknown_command'),
    count(*) filter (where projection_reason = 'device_not_owned'),
    count(*) filter (where projection_reason = 'unsupported_command_projection'),
    count(*) filter (where projection_reason = 'device_binding_mismatch'),
    count(*) filter (where projection_reason = 'authorization_epoch_mismatch'),
    count(*) filter (where projection_reason = 'boot_mismatch'),
    count(*) filter (where projection_reason = 'clock_unavailable'),
    count(*) filter (where projection_reason = 'clock_skew'),
    count(*) filter (where projection_reason = 'frame_expired'),
    count(*) filter (where projection_reason = 'command_expired'),
    count(*) filter (where projection_reason = 'illegal_ack_transition'),
    count(*) filter (where projection_reason = 'projection_conflict'),
    count(*) filter (where projection_reason not in (
      'unknown_command',
      'device_not_owned',
      'unsupported_command_projection',
      'device_binding_mismatch',
      'authorization_epoch_mismatch',
      'boot_mismatch',
      'clock_unavailable',
      'clock_skew',
      'frame_expired',
      'command_expired',
      'illegal_ack_transition',
      'projection_conflict'
    ))
  into
    v_ack_event_attempts,
    v_ack_unknown_command,
    v_ack_device_not_owned,
    v_ack_unsupported_command_projection,
    v_ack_device_binding_mismatch,
    v_ack_authorization_epoch_mismatch,
    v_ack_boot_mismatch,
    v_ack_clock_unavailable,
    v_ack_clock_skew,
    v_ack_frame_expired,
    v_ack_command_expired,
    v_ack_illegal_ack_transition,
    v_ack_projection_conflict,
    v_ack_other
  from private.device_command_ack_events
  where received_at >= v_window_start
    and received_at <= v_sampled_at
    and not applied;

  select
    count(*),
    count(*) filter (
      where trusted_telemetry_captured_at is not null
        and trusted_telemetry_received_at > v_shadow_cutoff
    ),
    count(*) filter (
      where trusted_telemetry_captured_at is not null
        and trusted_telemetry_received_at is not null
        and trusted_telemetry_received_at <= v_shadow_cutoff
    ),
    count(*) filter (
      where trusted_telemetry_captured_at is null
         or trusted_telemetry_received_at is null
    )
  into
    v_shadow_eligible,
    v_shadow_fresh,
    v_shadow_stale,
    v_shadow_missing
  from public.devices
  where not is_demo
    and owner_id is not null
    and robot_lifecycle = 'owned'
    and robot_public_key_fingerprint is not null
    and robot_active_boot_id is not null;

  return jsonb_build_object(
    'contract_version', 1,
    'sampled_at', v_sampled_at,
    'window', jsonb_build_object(
      'seconds', p_window_seconds,
      'started_at', v_window_start
    ),
    'shadow_stale_after_seconds', p_shadow_stale_seconds,
    'commands', jsonb_build_object(
      'queued', jsonb_build_object(
        'current_count', v_queued_current,
        'created_in_window_count', v_queued_created_in_window,
        'older_than_window_count', v_queued_older_than_window,
        'oldest_age_seconds', case
          when v_queued_oldest_at is null then null
          else greatest(0, floor(extract(epoch from (v_sampled_at - v_queued_oldest_at)))::bigint)
        end
      ),
      'in_flight', jsonb_build_object(
        'leased_count', v_leased,
        'leased_overdue_count', v_leased_overdue,
        'dispatching_count', v_dispatching,
        'dispatching_overdue_count', v_dispatching_overdue,
        'published_count', v_published,
        'published_overdue_count', v_published_overdue
      ),
      'attention', jsonb_build_object(
        'delivery_unknown_count', v_delivery_unknown,
        'dead_letter_count', v_dead_letter,
        'revocation_pending_count', v_revocation_pending
      )
    ),
    'ack_rejections', jsonb_build_object(
      'event_attempt_count', v_ack_event_attempts,
      'by_reason', jsonb_build_object(
        'unknown_command', v_ack_unknown_command,
        'device_not_owned', v_ack_device_not_owned,
        'unsupported_command_projection', v_ack_unsupported_command_projection,
        'device_binding_mismatch', v_ack_device_binding_mismatch,
        'authorization_epoch_mismatch', v_ack_authorization_epoch_mismatch,
        'boot_mismatch', v_ack_boot_mismatch,
        'clock_unavailable', v_ack_clock_unavailable,
        'clock_skew', v_ack_clock_skew,
        'frame_expired', v_ack_frame_expired,
        'command_expired', v_ack_command_expired,
        'illegal_ack_transition', v_ack_illegal_ack_transition,
        'projection_conflict', v_ack_projection_conflict,
        'other', v_ack_other
      )
    ),
    'trusted_shadows', jsonb_build_object(
      'eligible_device_count', v_shadow_eligible,
      'fresh_count', v_shadow_fresh,
      'stale_count', v_shadow_stale,
      'missing_count', v_shadow_missing
    )
  );
end;
$$;

revoke all on function public.get_robot_operations_observability(integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.get_robot_operations_observability(integer, integer)
  to service_role;

comment on function public.get_robot_operations_observability(integer, integer) is
  'Service-role-only aggregate robot operations snapshot. It returns no identifiers, payloads, transport errors, or unpersisted Edge/telemetry rejection signals.';
