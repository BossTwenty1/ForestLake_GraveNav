import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { createTestDatabase } from "./database-helper.mjs";
import { gisActors, gisLogin, seedGisFixtures } from "./gis-fixtures.mjs";

test("Staff Accounts V1 enforces invitation, access, audit and privacy in the database", async t => {
  const db = await createTestDatabase();
  t.after(() => db.close());
  await seedGisFixtures(db);

  const admin = gisActors.admin;
  const member = randomUUID();
  const name = "Fictional Clerk";
  const email = "clerk@example.test";
  const scalar = async (query, params = []) => (await db.query(query, params)).rows[0]?.value;
  const begin = (...args) => scalar("select public.staff_begin_invitation($1,$2,$3,$4) value", args);
  const directory = (search = "", role = "ALL", status = "ALL", page = 1) =>
    scalar("select public.staff_account_directory($1,$2,$3,$4) value", [search, role, status, page]);
  const details = () => scalar("select public.staff_account_details($1) value", [member]);
  const accountStatus = id => scalar("select account_status value from public.account where account_id=$1", [id]);
  const grant = revision => scalar("select public.staff_grant_account($1,$2) value", [member, revision]);
  const run = (id, revision, operation, value) => scalar(
    "select public.staff_save_record('account',$1,$2,$3::jsonb,$4,$5) value",
    [id, revision, JSON.stringify({ value: value ?? null }), randomUUID(), operation],
  );
  const asService = () => gisLogin(db, null, "service_role");
  const asOwner = () => gisLogin(db, null, "postgres");

  await gisLogin(db);
  await assert.rejects(begin(admin, email, name, "MANAGER"), /permission denied/i);
  await assert.rejects(scalar("select public.admin_create_account($1,$2,$3) value", [member, name, "MANAGER"]), /permission denied/i);
  const initial = await directory();

  await asService();
  await assert.rejects(begin(gisActors.manager, email, name, "MANAGER"), /active Administrator/i);
  const attempt = await begin(admin, email.toUpperCase(), name, "MANAGER");
  const duplicate = await begin(admin, email, name, "MANAGER");
  assert.equal(attempt.state, "send");
  assert.deepEqual(duplicate, { state: "sending" });
  await assert.rejects(begin(admin, "different@example.test", name.toLowerCase(), "MANAGER"), /already in use/i);
  const finish = sent => scalar("select public.staff_finish_invitation($1,$2,$3,$4,$5) value",
    [admin, attempt.id, attempt.attemptId, sent, member]);
  await assert.rejects(finish(true), /identity could not be confirmed/i);

  await asOwner();
  await db.query(`insert into auth.users(id,email,invited_at,raw_user_meta_data)
    values ($1,$2,now(),jsonb_build_object('gravenav_invitation_id',$3::text))`, [member, email, attempt.id]);
  await asService();
  assert.deepEqual(await finish(true), { state: "sent", accountId: member });
  assert.deepEqual(await finish(true), { state: "sent", accountId: member });
  assert.deepEqual(await begin(admin, email, name, "MANAGER"), { state: "sent", accountId: member });

  await gisLogin(db);
  const pending = await directory("CLERK@", "MANAGER", "PENDING");
  assert.equal(pending.total, 1);
  assert.equal(pending.summary.total, initial.summary.total + 1);
  assert.deepEqual(pending.items.map(item => item.accountId), [member]);
  assert.equal(pending.items[0].setupReady, false);
  assert.equal(pending.items[0].canResend, true);
  assert.equal(pending.items[0].lastSignInAt, null);
  assert.equal((await directory("CLERK@", "ADMIN", "PENDING")).total, 0);
  assert.deepEqual((await directory("", "ALL", "ALL", 2)).items, []);
  assert.equal((await details()).activity[0].action, "invite_sent");
  assert.doesNotMatch(JSON.stringify(await details()), /encrypted_password|gravenav_invitation_id|token/i);
  await assert.rejects(grant(pending.items[0].revision), /finish setting up/i);
  await assert.rejects(run(member, pending.items[0].revision, "approve"), /finish setting up/i);
  assert.equal(await accountStatus(member), "PENDING");

  await asOwner();
  await db.query("update auth.users set email_confirmed_at=now() where id=$1", [member]);
  await db.query("insert into public.audit_log(action,table_name,record_id) values('update','lot','test-operational')");
  await gisLogin(db);
  await assert.rejects(grant(pending.items[0].revision), /finish setting up/i);
  await asOwner();
  await db.query("update auth.users set encrypted_password='disposable-test-hash' where id=$1", [member]);
  await gisLogin(db);
  await assert.rejects(scalar("select public.record_staff_password_setup($1) value", [member]), /permission denied/i);
  await assert.rejects(grant(pending.items[0].revision), /finish setting up/i);
  await asService();
  await scalar("select public.record_staff_password_setup($1) value", [member]);
  await gisLogin(db);
  await assert.rejects(grant(pending.items[0].revision), /changed/i);
  await grant((await details()).account.revision);
  assert.equal(await accountStatus(member), "ACTIVE");
  assert.equal((await details()).account.canResend, false);

  await gisLogin(db, member);
  await assert.rejects(directory(), /active Administrator/i);
  await assert.rejects(details(), /active Administrator/i);
  await assert.rejects(run(admin, 1, "deactivate", "SUSPENDED"), /only administrators/i);
  assert.equal(await scalar("select count(*)::int value from public.audit_log where table_name='account'"), 0);
  assert.equal(await scalar("select count(*)::int value from public.audit_log where record_id='test-operational'"), 1);
  await assert.rejects(scalar("select count(*) value from public.export_audit_log()"), /active Administrator/i);

  await gisLogin(db);
  await assert.rejects(run(admin, 1, "role", "MANAGER"), /own staff role/i);
  await assert.rejects(run(admin, 1, "deactivate", "SUSPENDED"), /own account/i);
  const activeRevision = (await details()).account.revision;
  await assert.rejects(run(member, activeRevision, "deactivate", "REVOKED"), /only be suspended/i);
  const suspended = await run(member, activeRevision, "deactivate", "SUSPENDED");
  await gisLogin(db, member);
  assert.equal(await scalar("select public.is_active_admin_or_manager() value"), false);
  assert.equal(await scalar("select count(*)::int value from public.audit_log"), 0);
  await assert.rejects(run(member, suspended.revision, "role", "ADMIN"), /active staff/i);
  await gisLogin(db);
  await run(member, suspended.revision, "activate");
  assert.equal(await accountStatus(member), "ACTIVE");
  await asOwner();
  // Match databases where the audit trigger writes post-change snapshots only.
  await db.query("update public.audit_log set old_values=null where table_name='account' and record_id=$1", [member]);
  await gisLogin(db);
  const restored = (await details()).activity[0];
  assert.equal(restored.fromStatus, "SUSPENDED");
  assert.equal(restored.toStatus, "ACTIVE");

  await asOwner();
  await db.query("update public.account set is_active=false, account_status='REVOKED' where account_id=$1", [member]);
  await gisLogin(db);
  assert.equal((await directory()).summary.total, initial.summary.total);
  await assert.rejects(details(), /unavailable/i);
  assert.ok(await scalar("select count(*)::int value from public.audit_log where record_id=$1", [member]) > 0);

  await asOwner();
  await db.exec(`
    insert into auth.users(id,email)
    select gen_random_uuid(), 'directory-' || lpad(n::text,2,'0') || '@example.test'
    from generate_series(1,23) n;
    insert into public.account(account_id,role_id,username,is_active,account_status,approved_at)
    select u.id, r.role_id, split_part(u.email,'@',1), split_part(u.email,'@',1) < 'directory-22',
      case split_part(u.email,'@',1) when 'directory-22' then 'SUSPENDED'
        when 'directory-23' then 'REVOKED' else 'ACTIVE' end,
      now()
    from auth.users u cross join public.role r
    where lower(u.email) like 'directory-%@example.test' and r.role_name = 'MANAGER';
  `);
  await gisLogin(db);
  const first = await directory("  DIRECTORY- ", "MANAGER", "ACTIVE");
  const next = await directory("DIRECTORY-", "MANAGER", "ACTIVE", 2);
  assert.deepEqual(first.summary, {
    total: initial.summary.total + 22,
    active: initial.summary.active + 21,
    pending: initial.summary.pending,
    suspended: initial.summary.suspended + 1,
  });
  assert.deepEqual(next.summary, first.summary);
  assert.equal(first.total, 21);
  assert.equal(next.total, first.total);
  assert.equal(first.items.length, 20);
  assert.equal(next.items.length, 1);
  assert.equal(new Set([...first.items, ...next.items].map(item => item.accountId)).size, 21);
  assert.equal(next.items[0].username, "directory-21");
  assert.equal(next.items[0].lastSignInAt, null);
  assert.equal((await directory("DIRECTORY-", "ADMIN", "ACTIVE")).total, 0);
  assert.equal((await directory("DIRECTORY-22@EXAMPLE", "MANAGER", "SUSPENDED")).total, 1);
  assert.equal((await directory("DIRECTORY-23")).total, 0);
  await assert.rejects(directory("", "ALL", "ALL", 0), /invalid directory filters/i);

  await gisLogin(db, null, "anon");
  await assert.rejects(directory(), /permission denied/i);
});
