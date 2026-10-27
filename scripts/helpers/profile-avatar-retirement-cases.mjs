import assert from 'node:assert/strict';

// Actual SQL/RLS/RPC on the isolated fixture. This models Storage's rolled-back
// permission probe; it does NOT execute the HTTP Storage service or object bytes.
export async function runProfileAvatarRetirementCases({ observer, a, b, report, owner, objectName, avatar, claims, aPid, bPid }) {
  await observer.query(`CREATE FUNCTION private.fixture_avatar_attempt(p_kind text, p_path text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $fixture$
    DECLARE r jsonb; n integer;
    BEGIN
      IF p_kind='prepare' THEN r := public.prepare_my_profile_avatar_cleanup('${owner}',p_path);
      ELSIF p_kind='save' THEN
        SELECT to_jsonb(p) INTO r FROM public.update_my_profile('${owner}','fixture_user','Synthetic','replace','profile-avatars/'||p_path) p;
      ELSIF p_kind='upload' THEN
        INSERT INTO storage.objects(bucket_id,name) VALUES('profile-avatars',p_path); r:='{}'::jsonb;
      ELSE RAISE EXCEPTION 'invalid fixture operation'; END IF;
      RETURN jsonb_build_object('ok',true,'data',r);
    EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('ok',false,'code',SQLSTATE,'message',SQLERRM);
    END; $fixture$;`);
  const auth = `SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claims','${claims}',true);`;
  const attempt = async (client, kind, path = objectName) => JSON.parse((await client.query(`SELECT private.fixture_avatar_attempt('${kind}','${path}');`))[0]);
  const begin = (client, isolation = 'READ COMMITTED') => client.query(`BEGIN ISOLATION LEVEL ${isolation}; ${auth}`);
  const reset = () => observer.query(`TRUNCATE private.profile_avatar_retirements,storage.objects,public.profiles,public.audit_logs;
    INSERT INTO public.profiles(id,email,username,username_claimed_at,username_provenance,display_name,avatar_url)
    VALUES('${owner}','synthetic@example.test','fixture_user',now(),'registration','Synthetic',NULL);
    SELECT set_config('request.jwt.claims','${claims}',false);
    INSERT INTO storage.objects(bucket_id,name) VALUES('profile-avatars','${objectName}');`);
  const state = async () => JSON.parse((await observer.query(`SELECT json_build_object(
    'avatar',(SELECT avatar_url FROM public.profiles WHERE id='${owner}'),
    'epoch',(SELECT avatar_lifecycle_epoch FROM public.profiles WHERE id='${owner}'),
    'retired',(SELECT count(*) FROM private.profile_avatar_retirements WHERE owner_id='${owner}'),
    'objectExists',EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='profile-avatars' AND name='${objectName}'));`))[0]);
  const deleted = async (client) => Number((await client.query(`WITH d AS (DELETE FROM storage.objects WHERE bucket_id='profile-avatars' AND name='${objectName}' RETURNING name) SELECT count(*) FROM d;`))[0]);
  const waitFor = async (blocked, blocker) => {
    const end = Date.now() + 7000;
    while (Date.now() < end) {
      const record = JSON.parse((await observer.query(`SELECT json_build_object('pid',pid,'waitType',wait_event_type,'blockers',pg_blocking_pids(pid)) FROM pg_stat_activity WHERE pid=${Number(blocked)};`))[0]);
      if (record.waitType === 'Lock' && record.blockers.includes(Number(blocker))) return record;
      await new Promise((done) => setTimeout(done, 75));
    }
    throw new Error('Expected actual backend lock wait did not occur');
  };
  const add = (name, details) => report.cases.push({ name, ...details, result: 'SYNTHETIC_DB_PASS' });

  await reset(); await begin(a);
  assert.equal(await deleted(a), 0, 'an unprepared path must not be deletable');
  const prepared = await attempt(a, 'prepare');
  assert.equal(prepared.data.status, 'retired');
  await a.query('COMMIT;');
  const before = await state();
  await begin(a); assert.equal((await attempt(a, 'prepare')).data.status, 'retired'); await a.query('COMMIT;');
  assert.deepEqual(await state(), before, 'idempotent retry must not bump epoch/create another retirement');
  await begin(a);
  // Model the upstream permission test rollback followed by the later privileged
  // metadata delete. The retirement was committed BEFORE this transaction.
  await a.query('SAVEPOINT storage_permission_probe;');
  assert.equal(await deleted(a), 1);
  await a.query('ROLLBACK TO SAVEPOINT storage_permission_probe; RESET ROLE;');
  assert.equal(await deleted(a), 1);
  await a.query('COMMIT;');
  assert.equal((await state()).retired, 1);
  await begin(a);
  const alreadyAbsent = await attempt(a, 'prepare');
  assert.deepEqual(alreadyAbsent.data, { status: 'retired-missing', ownerId: owner, objectPath: objectName },
    'a committed retirement plus missing metadata must be distinguishable from an unknown DELETE');
  await a.query('COMMIT;');
  assert.deepEqual(await state(), { avatar: null, epoch: 1, retired: 1, objectExists: false },
    'absent-object preparation retry must not add another retirement or bump epoch');
  await observer.query('CREATE POLICY fixture_broad_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK(true);');
  await begin(a);
  const reuse = await attempt(a, 'upload'); assert.equal(reuse.ok, false); assert.equal(reuse.code, '42501');
  const attach = await attempt(a, 'save'); assert.equal(attach.ok, false); assert.equal(attach.message, 'avatar_retired');
  await a.query('COMMIT;');
  await observer.query('DROP POLICY fixture_broad_insert ON storage.objects;');
  add('durable prepare / probe rollback / removal / absent recovery / no reuse', { prepared, alreadyAbsent, reuse, attach, final: await state() });

  for (const isolation of ['READ COMMITTED', 'REPEATABLE READ']) {
    await reset(); await begin(a, isolation);
    assert.equal((await attempt(a, 'prepare')).data.status, 'retired');
    await begin(b, isolation);
    const pending = attempt(b, 'save');
    const blocking = await waitFor(bPid, aPid);
    await a.query('COMMIT;');
    const saved = await pending;
    assert.equal(saved.ok, false);
    assert.equal(saved.code, isolation === 'READ COMMITTED' ? '22023' : '40001');
    if (isolation === 'READ COMMITTED') assert.equal(saved.message, 'avatar_retired');
    await b.query('COMMIT;'); await begin(a); assert.equal(await deleted(a), 1); await a.query('COMMIT;');
    assert.deepEqual(await state(), { avatar: null, epoch: 1, retired: 1, objectExists: false });
    add('prepare first vs save', { isolation, blocking, saved, final: await state() });

    await reset(); await begin(b, isolation);
    assert.equal((await attempt(b, 'save')).data.avatar_url, avatar);
    await begin(a, isolation);
    const preparing = attempt(a, 'prepare');
    const reverseBlocking = await waitFor(aPid, bPid);
    await b.query('COMMIT;');
    const reservation = await preparing;
    if (isolation === 'READ COMMITTED') assert.equal(reservation.data.status, 'protected-current');
    else { assert.equal(reservation.ok, false); assert.equal(reservation.code, '40001'); }
    await a.query('COMMIT;'); await begin(a); assert.equal(await deleted(a), 0); await a.query('COMMIT;');
    assert.deepEqual(await state(), { avatar, epoch: 0, retired: 0, objectExists: true });
    add('save first vs prepare', { isolation, blocking: reverseBlocking, reservation, final: await state() });

    await reset(); await begin(a, isolation);
    assert.equal((await attempt(a, 'prepare')).data.status, 'retired');
    await begin(b, isolation);
    const secondPreparation = attempt(b, 'prepare');
    const sameKeyBlocking = await waitFor(bPid, aPid);
    await a.query('COMMIT;');
    const secondResult = await secondPreparation;
    if (isolation === 'READ COMMITTED') assert.equal(secondResult.data.status, 'retired');
    else { assert.equal(secondResult.ok, false); assert.equal(secondResult.code, '40001'); }
    await b.query('COMMIT;');
    await begin(b); assert.equal((await attempt(b, 'prepare')).data.status, 'retired'); await b.query('COMMIT;');
    assert.deepEqual(await state(), { avatar: null, epoch: 1, retired: 1, objectExists: true });
    add('same-key concurrent prepare and explicit later retry', { isolation, blocking: sameKeyBlocking, secondResult, final: await state() });
  }

  await reset(); await begin(a);
  const missingPath = `${owner}/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.png`;
  assert.equal((await attempt(a, 'prepare', missingPath)).data.status, 'object-missing');
  const foreign = await attempt(a, 'prepare', '22222222-2222-4222-8222-222222222222/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png');
  assert.equal(foreign.ok, false); assert.equal(foreign.code, '22023');
  await a.query('COMMIT;');
  assert.deepEqual(await state(), { avatar: null, epoch: 0, retired: 0, objectExists: true });
  const [privileges] = await observer.query(`SELECT json_build_object(
    'anonPrepare',has_function_privilege('anon','public.prepare_my_profile_avatar_cleanup(uuid,text)','EXECUTE'),
    'servicePrepare',has_function_privilege('service_role','public.prepare_my_profile_avatar_cleanup(uuid,text)','EXECUTE'),
    'clientEpochWrite',has_column_privilege('authenticated','public.profiles','avatar_lifecycle_epoch','UPDATE'),
    'clientRetirementWrite',has_table_privilege('authenticated','private.profile_avatar_retirements','INSERT'));`);
  assert(Object.values(JSON.parse(privileges)).every((value) => value === false));
  add('missing/foreign/no arbitrary retirement or privilege', { foreign, privileges: JSON.parse(privileges), final: await state() });

  // Another permissive DELETE policy cannot defeat the restrictive guard.
  await observer.query('CREATE POLICY fixture_broad_delete ON storage.objects FOR DELETE TO authenticated USING(true);');
  await begin(a); assert.equal(await deleted(a), 0); await a.query('COMMIT;');
  await observer.query('DROP POLICY fixture_broad_delete ON storage.objects;');
  add('permissive policy cannot bypass preparation', { final: await state() });

  await reset();
  const mixedPath = `${owner}/cccccccc-cccc-4ccc-8ccc-cccccccccccc.png`;
  await observer.query(`INSERT INTO storage.objects(bucket_id,name) VALUES('profile-avatars','${mixedPath}');`);
  await begin(a); assert.equal((await attempt(a, 'prepare')).data.status, 'retired'); await a.query('COMMIT;');
  await begin(a);
  assert.equal((await a.query(`WITH d AS (DELETE FROM storage.objects WHERE bucket_id='profile-avatars' AND name IN ('${objectName}','${mixedPath}') RETURNING name) SELECT count(*) FROM d;`))[0], '1');
  await a.query('COMMIT;');
  assert.equal((await observer.query(`SELECT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='profile-avatars' AND name='${mixedPath}');`))[0], 't');
  add('mixed batch removes only durably prepared path', { final: await state() });

  await observer.query(`INSERT INTO storage.buckets(id,name) VALUES('fixture-other','fixture-other');
    INSERT INTO storage.objects(bucket_id,name) VALUES('fixture-other','unrelated.txt');
    CREATE POLICY fixture_other_select ON storage.objects FOR SELECT TO authenticated USING(bucket_id='fixture-other');
    CREATE POLICY fixture_other_delete ON storage.objects FOR DELETE TO authenticated USING(bucket_id='fixture-other');`);
  await begin(a);
  assert.equal((await a.query("WITH d AS (DELETE FROM storage.objects WHERE bucket_id='fixture-other' RETURNING name) SELECT count(*) FROM d;"))[0], '1');
  await a.query('COMMIT;');
  add('unrelated bucket delete policy remains effective', {});

  await observer.query(`CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_app_meta_data jsonb,raw_user_meta_data jsonb);
    CREATE TRIGGER fixture_sync_provider AFTER INSERT OR UPDATE ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
    INSERT INTO auth.users VALUES('22222222-2222-4222-8222-222222222222','provider@example.test','{"provider":"apple"}',
      '{"full_name":"Provider","avatar_url":"profile-avatars/22222222-2222-4222-8222-222222222222/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png"}');`);
  assert.equal((await observer.query("SELECT avatar_url IS NULL FROM public.profiles WHERE id='22222222-2222-4222-8222-222222222222';"))[0], 't');
  await observer.query(`UPDATE auth.users SET raw_user_meta_data='{"full_name":"Provider","avatar_url":"https://provider.example/image.png"}' WHERE id='22222222-2222-4222-8222-222222222222';`);
  assert.equal((await observer.query("SELECT avatar_url FROM public.profiles WHERE id='22222222-2222-4222-8222-222222222222';"))[0], 'https://provider.example/image.png');
  await observer.query(`UPDATE auth.users SET raw_user_meta_data='{"full_name":"Provider","avatar_url":"profile-avatars/22222222-2222-4222-8222-222222222222/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png"}' WHERE id='22222222-2222-4222-8222-222222222222';`);
  assert.equal((await observer.query("SELECT avatar_url FROM public.profiles WHERE id='22222222-2222-4222-8222-222222222222';"))[0], 'https://provider.example/image.png');
  add('provider metadata cannot assign private paths', { scope: 'Synthetic auth.users trigger invokes actual handle_new_user; no Auth server validation.' });
}
