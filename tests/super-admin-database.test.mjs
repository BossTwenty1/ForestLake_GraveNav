import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { createTestDatabase } from "./database-helper.mjs";
import { gisActors, gisLogin, seedGisFixtures } from "./gis-fixtures.mjs";

test("super administrator bootstrap and account protections", async t => {
  const db = await createTestDatabase();
  t.after(() => db.close());
  await seedGisFixtures(db);
  await db.exec(`insert into auth.users(id) values ('30000000-0000-0000-0000-000000000001');
    insert into public.account(account_id,role_id,username,is_active,account_status)
    select '30000000-0000-0000-0000-000000000001',role_id,'pending-super',false,'PENDING'
    from public.role where role_name='SUPER_ADMIN'`);
  const scalar = async (sql, params = []) => (await db.query(sql, params)).rows[0]?.value;
  await gisLogin(db, null, "postgres");
  await db.exec(`update auth.users set email='pending@example.test', email_confirmed_at=now(), encrypted_password='test'
    where id='30000000-0000-0000-0000-000000000001';
    update public.account set password_setup_at=now() where account_id='30000000-0000-0000-0000-000000000001'`);
  await gisLogin(db);
  assert.equal(await scalar("select public.can_manage_staff_accounts() value"), true);
  await db.exec("begin");
  const pendingRevision = await scalar("select revision value from public.account where username='pending-super'");
  await scalar("select public.staff_grant_account($1,$2) value", ["30000000-0000-0000-0000-000000000001", pendingRevision]);
  assert.equal(await scalar("select public.can_manage_staff_accounts() value"), false);
  await db.exec("rollback");
  assert.equal(await scalar("select public.can_manage_staff_accounts() value"), true);
  await assert.rejects(scalar("select staff_private.bootstrap_super_admin($1) value", [gisActors.admin]), /permission denied/i);
  await gisLogin(db, null, "postgres");
  await db.exec("delete from public.account where account_id='30000000-0000-0000-0000-000000000001'");
  await assert.rejects(scalar("select staff_private.bootstrap_super_admin($1) value", [gisActors.admin]), /verified/i);
  await db.query("update auth.users set email=$1,email_confirmed_at=now(),encrypted_password=$2 where id=$3", ["fictional@example.test", "disposable-hash", gisActors.admin]);
  await db.query("update auth.users set email=$1,email_confirmed_at=now(),encrypted_password=$2 where id=$3", ["second@example.test", "disposable-hash", gisActors.otherAdmin]);
  await scalar("select staff_private.bootstrap_super_admin($1) value", [gisActors.admin]);
  await assert.rejects(scalar("select staff_private.bootstrap_super_admin($1) value", [gisActors.otherAdmin]), /already exists/i);
  await db.exec("insert into public.audit_log(action,table_name,record_id) values ('update','account','private-test')");
  await gisLogin(db, null, "service_role");
  await assert.rejects(scalar("select public.staff_begin_invitation($1,$2,$3,$4) value", [gisActors.otherAdmin,"new@example.test","new staff","MANAGER"]), /active Administrator/i);
  await gisLogin(db, gisActors.otherAdmin);
  assert.equal(await scalar("select public.can_manage_staff_accounts() value"), false);
  assert.equal(await scalar("select count(*)::int value from public.audit_log where record_id='private-test'"), 0);
  assert.equal(await scalar("select count(*)::int value from public.account where account_id=$1", [gisActors.admin]), 0);
  await assert.rejects(scalar("select public.staff_save_record('account',$1,1,$2::jsonb,$3,'role') value", [gisActors.manager, JSON.stringify({value:'ADMIN'}), randomUUID()]), /administrators/i);
  await assert.rejects(scalar("select public.admin_update_site_settings(1,'a','b','','','',false,'','','info','',false,false) value"), /security administrator/i);
  await assert.rejects(scalar("select public.staff_account_directory() value"), /active Administrator/i);
  await gisLogin(db, gisActors.manager);
  assert.equal(await scalar("select public.can_manage_staff_accounts() value"), false);
  await gisLogin(db, gisActors.admin);
  assert.equal(await scalar("select public.can_manage_staff_accounts() value"), true);
  assert.equal(await scalar("select public.is_active_admin() value"), true);
  assert.equal(await scalar("select count(*)::int value from public.audit_log where record_id='private-test'"), 1);
  assert.ok((await scalar("select public.staff_account_directory() value")).items.some(item => item.role === "SUPER_ADMIN"));
  const change = async (id, operation, value) => {
    const revision = await scalar("select revision value from public.account where account_id=$1", [id]);
    return scalar("select public.staff_save_record('account',$1,$2,$3::jsonb,$4,$5) value", [id, revision, JSON.stringify({ value }), randomUUID(), operation]);
  };
  await assert.rejects(change(gisActors.admin,"role","ADMIN"), /own staff role/i);
  await assert.rejects(change(gisActors.admin,"deactivate","SUSPENDED"), /own account/i);
  await gisLogin(db, null, "postgres");
  await assert.rejects(db.query("update public.account set role_id=(select role_id from public.role where role_name='ADMIN') where account_id=$1", [gisActors.admin]), /last active Super Administrator/i);
  await gisLogin(db, gisActors.admin);
  await change(gisActors.otherAdmin,"role","SUPER_ADMIN");
  await change(gisActors.otherAdmin,"deactivate","SUSPENDED");
  await change(gisActors.otherAdmin,"activate",null);
});
