import assert from "node:assert/strict";
import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { test } from "node:test";

const PUGI = "9f08a285-a1e2-444f-b07e-b897e43e6c92";
const OTHER = "10000000-0000-0000-0000-000000000004";
const RPC = "execute_phase2_single_pilot_3721";
const INSTALL = new URL("../scripts/phase2-staging/install-single-pilot-rpc.sql", import.meta.url);
const REMOVE = new URL("../scripts/phase2-staging/remove-single-pilot-rpc.sql", import.meta.url);
const MIGRATIONS = new URL("../supabase/migrations/", import.meta.url);
const quote = value => "'" + String(value).replaceAll("'", "''") + "'";
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
function docker(args, input) {
  return spawnSync("docker", args, { input, encoding: "utf8", maxBuffer: 8 * 1024 * 1024, timeout: 90_000 });
}
function run(args, input) {
  const r = docker(args, input);
  assert.equal(r.status, 0, r.stderr || "Local Docker command failed");
  return r.stdout.trim();
}

// Uses only cached images, synthetic accounts and an isolated disposable network.
// PUGI tokens are issued by GoTrue password login and verified by PostgREST, never SQL claim setters.
test("fixed pilot RPC through genuine local Supabase Auth and PostgreSQL 17", { timeout: 240_000 }, async t => {
  const suffix = randomUUID().slice(0, 8), network = `gravenav-pilot-test-${suffix}`;
  const db = `${network}-db`, auth = `${network}-auth`, rest = `${network}-rest`;
  const containers = [rest, auth, db];
  t.after(() => {
    for (const c of containers) docker(["rm", "-f", c]);
    docker(["network", "rm", network]);
  });
  run(["version", "--format", "{{.Server.Version}}"]);
  run(["network", "create", network]);
  const start = (name, image, options = []) => run(["run", "--pull", "never", "-d", "--name", name, "--network", network, ...options, image]);
  const sql = statement => run(["exec", "-i", db, "psql", "-X", "-h", "/tmp", "-U", "postgres", "-d", "postgres", "-qAt", "-v", "ON_ERROR_STOP=1"], statement);
  const json = statement => JSON.parse(sql(statement));
  const boot = "mkdir /test/data && chown postgres:postgres /test /test/data && gosu postgres initdb -D /test/data -U postgres --auth=trust >/test/init.log 2>&1 && echo 'host all all samenet trust' >> /test/data/pg_hba.conf && exec gosu postgres postgres -D /test/data -c listen_addresses='*' -c unix_socket_directories=/tmp";
  run(["run", "--pull", "never", "-d", "--name", db, "--network", network, "--network-alias", "db", "--tmpfs", "/test:rw,nosuid,nodev,size=1073741824", "--entrypoint", "/bin/sh", "public.ecr.aws/supabase/postgres:17.6.1.167", "-ec", boot]);
  for (let i = 0; i < 60; i++) {
    if (docker(["exec", db, "pg_isready", "-h", "/tmp", "-U", "postgres"]).status === 0) break;
    await sleep(250);
    if (i === 59) assert.fail("Disposable PostgreSQL did not become ready");
  }
  sql("create schema auth;");
  const secret = randomBytes(48).toString("hex");
  start(auth, "public.ecr.aws/supabase/gotrue:v2.196.0", ["-p", "127.0.0.1::9999",
    "-e", "GOTRUE_API_HOST=0.0.0.0", "-e", "GOTRUE_API_PORT=9999", "-e", "API_EXTERNAL_URL=http://localhost",
    "-e", "GOTRUE_SITE_URL=http://localhost", "-e", "GOTRUE_DB_DRIVER=postgres",
    "-e", "GOTRUE_DB_DATABASE_URL=postgres://postgres@db:5432/postgres?sslmode=disable&search_path=auth",
    "-e", `GOTRUE_JWT_SECRET=${secret}`, "-e", "GOTRUE_JWT_AUD=authenticated",
    "-e", "GOTRUE_JWT_ADMIN_ROLES=service_role", "-e", "GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated", "-e", "GOTRUE_EXTERNAL_EMAIL_ENABLED=true",
    "-e", "GOTRUE_MAILER_AUTOCONFIRM=true"]);
  const origin = (container, port) => {
    const published = docker(["port", container, `${port}/tcp`]);
    const logs = published.status ? docker(["logs", container]) : null;
    assert.equal(published.status, 0, logs ? (logs.stderr + logs.stdout).slice(-2000) : "Port unavailable");
    return `http://${published.stdout.trim()}`;
  };
  const authUrl = origin(auth, 9999);
  async function ready(url) {
    for (let i = 0; i < 100; i++) {
      try { if ((await fetch(url)).ok) return; } catch { /* Starting local service. */ }
      await sleep(250);
    }
    assert.fail("Disposable local API did not become ready");
  }
  await ready(`${authUrl}/health`);
  sql(`create role anon;create role authenticated;create role service_role bypassrls;
    create role authenticator login noinherit;grant anon,authenticated,service_role to authenticator;
    create or replace function auth.uid() returns uuid language sql stable as $$
      select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid $$;
    create or replace function auth.role() returns text language sql stable as $$
      select nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role' $$;
    grant usage on schema auth to anon,authenticated;grant execute on function auth.uid(),auth.role() to anon,authenticated;`);
  const migrations = (await readdir(MIGRATIONS)).filter(x => x.endsWith(".sql")).sort();
  for (const f of migrations) sql(await readFile(new URL(f, MIGRATIONS), "utf8"));
  sql(`create schema supabase_migrations;create table supabase_migrations.schema_migrations(version text primary key);
    insert into supabase_migrations.schema_migrations values
    ('20261107000000'),('20261107010000'),('20261116010000'),('20261117010000');`);
  const install = await readFile(INSTALL, "utf8");
  for (const [name, hash] of [["owner", "f8f869a306521f1550f85873eefae18e2d84b2cf3ca47650762999529d033fa8"], ["burial", "3e351e5f5f355de70d20e968cc54c07927661da02fa2ccffc76b42da0d7e5df3"]]) {
    const literal = install.match(new RegExp(` ${name}_values constant jsonb := (.*);`))[1];
    assert.equal(createHash("sha256").update(literal).digest("hex"), hash, "Approved UTF-8 payload changed");
  }
  assert.doesNotMatch(install, /set_config|request\.jwt\.claim\.sub/i);
  sql(install);
  // Only the test service-role bootstrap token is signed here. User tokens come from Auth.
  const part = x => Buffer.from(JSON.stringify(x)).toString("base64url");
  const serviceBody = `${part({ alg: "HS256", typ: "JWT" })}.${part({ role: "service_role", exp: Math.floor(Date.now() / 1000) + 600 })}`;
  const serviceToken = serviceBody + "." + createHmac("sha256", secret).update(serviceBody).digest("base64url");
  async function request(url, token, body) {
    const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
    return { status: response.status, body: await response.json() };
  }
  const sessions = {};
  for (const [id, email] of [[PUGI, "pugi@pilot.test"], [OTHER, "other@pilot.test"]]) {
    const password = randomBytes(24).toString("hex");
    const created = await request(`${authUrl}/admin/users`, serviceToken, { id, email, password, email_confirm: true, role: "authenticated" });
    if (created.status !== 200) {
      const logs = docker(["logs", auth]);
      const errors = (logs.stdout + logs.stderr).split("\n").flatMap(line => {
        try { const row = JSON.parse(line);return row.error ? [row.error] : []; } catch { return []; }
      });
      assert.fail("Local Auth fixture creation failed: " + errors.join("; "));
    }
    assert.equal(created.body.id, id);
    const signed = await request(`${authUrl}/token?grant_type=password`, null, { email, password });
    assert.equal(signed.status, 200, "Local password authentication failed");
    sessions[id] = signed.body.access_token;
    assert.equal(signed.body.user.role, "authenticated");
    const verified = await fetch(`${authUrl}/user`, { headers: { Authorization: `Bearer ${sessions[id]}` } });
    assert.equal(verified.status, 200);
    assert.equal((await verified.json()).id, id);
    sql(`insert into public.account(account_id,role_id,username,is_active,account_status,approved_at)
      select ${quote(id)},role_id,${quote(id === PUGI ? "PUGI" : "OTHER_ADMIN")},true,'ACTIVE',now() from public.role where role_name='ADMIN';`);
  }
  // Coordinates are isolated test geometry, never asserted to represent any physical site.
  sql(`insert into public.site(site_id,site_name,address) values(1,'Fictional pilot test','Local fixture');
    insert into public.area(area_id,site_id,area_code,area_name,area_category,boundary_geom) values(5,1,'BPG','Butterfly Palm Garden','garden',extensions.st_geogfromtext('POLYGON((-1 -1,1 -1,1 1,-1 1,-1 -1))'));
    insert into public.sector(sector_id,area_id,sector_code) values(1,5,'A');
    insert into public.block(block_id,sector_id,block_number) values(1,1,1);
    insert into public.lot(lot_id,area_id,block_id,lot_code,status,revision,location_geom,coordinate_status,coordinate_verified)
      values(3721,5,1,'BPG-A-0001','HOLD',2,extensions.st_geogfromtext('SRID=4326;POINT(0 0)'),'verified',true),
            (3722,5,1,'LOCAL-UNRELATED','HOLD',2,null,'pending',false);`);
  start(rest, "public.ecr.aws/supabase/postgrest:v16.2", ["-p", "127.0.0.1::3000",
    "-e", "PGRST_DB_URI=postgres://authenticator@db:5432/postgres", "-e", "PGRST_DB_SCHEMAS=public",
    "-e", "PGRST_DB_ANON_ROLE=anon", "-e", `PGRST_JWT_SECRET=${secret}`]);
  const restUrl = origin(rest, 3000);
  await ready(restUrl);
  const call = (token = sessions[PUGI], body = {}) => request(`${restUrl}/rpc/${RPC}`, token, body);
  const snapshot = () => json(`select jsonb_object_agg(table_name,rows) from (
    ${["lot", "lot_owner", "deceased", "burial_record", "staff_mutation", "record_history", "audit_log", "grave_interment_write_fence"].map(table => `select '${table}' table_name,coalesce(jsonb_agg(row order by row::text),'[]'::jsonb) rows from(select to_jsonb(t) row from public.${table} t)s`).join(" union all ")})q;`);
  async function rejected(pattern, token = sessions[PUGI], body = {}) {
    const before = snapshot(), result = await call(token, body);
    assert.ok(result.status >= 400, "RPC unexpectedly succeeded");
    if (pattern) assert.match(JSON.stringify(result.body), pattern);
    assert.deepEqual(snapshot(), before, "Failed request left partial application writes");
  }
  await t.test("anonymous, invalid signatures and another genuine ADMIN are rejected", async () => {
    await rejected(/permission denied/, null);
    const parts = sessions[OTHER].split(".");
    const claims = JSON.parse(Buffer.from(parts[1], "base64url"));claims.sub = PUGI;
    parts[1] = part(claims);
    await rejected(/signature|JWT|JWS/i, parts.join("."));
    await rejected(/Authenticated PUGI/, sessions[OTHER]);
    await rejected(null, serviceToken);
    await rejected(null, sessions[PUGI], { lot_id: 3722 });
  });
  await t.test("exact PUGI name, active status and ADMIN role are mandatory", async () => {
    for (const [patch, restore] of [["username='RENAMED'", "username='PUGI'"], ["is_active=false,account_status='PENDING'", "is_active=true,account_status='ACTIVE'"], ["is_active=false,account_status='SUSPENDED'", "is_active=true,account_status='ACTIVE'"], ["role_id=(select role_id from public.role where role_name='MANAGER')", "role_id=(select role_id from public.role where role_name='ADMIN')"]]) {
      sql(`update public.account set ${patch} where account_id='${PUGI}';`);
      try { await rejected(/PUGI authorization changed/); }
      finally { sql(`update public.account set ${restore} where account_id='${PUGI}';`); }
    }
  });
  await t.test("INVOKER cannot retain the existing locked authorization checks", async () => {
    sql(`alter function public.${RPC}() security invoker;`);
    await rejected(/permission denied/);
    sql(`alter function public.${RPC}() security definer;`);
    const privileges = json(`select jsonb_build_object('anon',has_function_privilege('anon','public.${RPC}()','EXECUTE'),'service',has_function_privilege('service_role','public.${RPC}()','EXECUTE'),'auth',has_function_privilege('authenticated','public.${RPC}()','EXECUTE'),'receipt_read',has_table_privilege('authenticated','public.staff_mutation','SELECT'));`);
    assert.deepEqual(privileges, { anon: false, service: false, auth: true, receipt_read: false });
  });
  await t.test("stale revisions, conflicting references and partial receipts stop before writes", async () => {
    sql("update public.lot set revision=99 where lot_id=3721;");
    await rejected(/identity\/revision/);
    sql("alter table public.lot disable trigger lot_revision;update public.lot set revision=2 where lot_id=3721;alter table public.lot enable trigger lot_revision;");
    sql("update public.lot set legacy_location_code='LOCAL-CONFLICT' where lot_id=3721;alter table public.lot disable trigger lot_revision;update public.lot set revision=2 where lot_id=3721;alter table public.lot enable trigger lot_revision;");
    await rejected(/Conflicting source/);
    sql("alter table public.lot disable trigger lot_revision;update public.lot set legacy_location_code=null,revision=2 where lot_id=3721;alter table public.lot enable trigger lot_revision;");
    sql(`insert into public.staff_mutation(actor_id,request_id,request) values('${PUGI}','8f450bc1-d70a-5a4c-828d-87f287dcf1ee','{}');`);
    await rejected(/Incomplete pilot receipts/);
    sql("delete from public.staff_mutation;");
  });
  await t.test("failure after owner or lot save rolls back all records, receipts, history and audits", async () => {
    sql("create function public.pilot_test_failure() returns trigger language plpgsql as $$begin raise exception 'Local forced failure';end$$;");
    for (const [table, event] of [["lot", "update"], ["burial_record", "insert"]]) {
      sql(`create trigger pilot_test_failure before ${event} on public.${table} for each row execute function public.pilot_test_failure();`);
      await rejected(/Local forced failure/);
      sql(`drop trigger pilot_test_failure on public.${table};`);
    }
    sql("drop function public.pilot_test_failure();");
  });
  await t.test("unchanged preservation guard rejects unrelated lot side effects atomically", async () => {
    sql("create function public.pilot_test_side_effect() returns trigger language plpgsql as $$begin new.width_m:=1.25;return new;end$$;create trigger pilot_test_side_effect before update on public.lot for each row execute function public.pilot_test_side_effect();");
    await rejected(/Unapproved target fields changed/);
    sql("drop trigger pilot_test_side_effect on public.lot;drop function public.pilot_test_side_effect();");
  });
  let receipt;
  await t.test("genuine Auth session commits exactly one pilot with correct attribution and preserved geometry", async () => {
    const before = snapshot(), result = await call();
    assert.equal(result.status, 200, JSON.stringify(result.body));receipt = result.body;
    assert.equal(receipt.actor_id, PUGI);assert.equal(receipt.replayed, false);
    assert.equal(receipt.internal_lot_code, "BPG-A-0001");assert.equal(receipt.synthetic_plot_reference, "BPG A / Block 1 / Lot 9");
    assert.equal(receipt.receipts.length, 3);
    const after = snapshot(), oldLot = before.lot.find(l => l.lot_id === 3721), newLot = after.lot.find(l => l.lot_id === 3721);
    const strip = l => Object.fromEntries(Object.entries(l).filter(([k]) => !["lot_owner_id", "status", "revision", "updated_at"].includes(k)));
    assert.deepEqual(strip(newLot), strip(oldLot));assert.equal(newLot.revision, 3);assert.equal(newLot.status, "AVAILABLE");
    assert.deepEqual(after.lot.find(l => l.lot_id === 3722), before.lot.find(l => l.lot_id === 3722));
    assert.equal(after.lot_owner.length, 1);assert.equal(after.deceased.length, 1);assert.equal(after.burial_record.length, 1);
    assert.equal(after.staff_mutation.length, 3);assert.ok(after.staff_mutation.every(r => r.actor_id === PUGI));
    assert.equal(after.record_history.at(-1).actor_id, PUGI);
    const newAudits = after.audit_log.filter(a => !before.audit_log.some(b => b.audit_id === a.audit_id));
    assert.equal(newAudits.length, 4);assert.ok(newAudits.every(a => a.actor_account_id === PUGI));
    assert.equal(after.burial_record[0].created_by, PUGI);assert.equal(after.burial_record[0].updated_by, PUGI);
    assert.equal(JSON.parse(after.burial_record[0].quality_notes).forest_lake_physical_assignment_verified, false);
  });
  await t.test("exact replay is read-only and altered receipt fingerprints are rejected", async () => {
    const before = snapshot(), replay = await call();
    assert.equal(replay.status, 200, JSON.stringify(replay.body));assert.equal(replay.body.replayed, true);
    assert.deepEqual(replay.body.receipts, receipt.receipts);assert.deepEqual(snapshot(), before);
    const original = sql(`select request from public.staff_mutation where request_id='8f450bc1-d70a-5a4c-828d-87f287dcf1ee';`);
    sql("update public.staff_mutation set request=request||'{\"values\":{}}'::jsonb where request_id='8f450bc1-d70a-5a4c-828d-87f287dcf1ee';");
    await rejected(/Receipt fingerprint conflict/);
    sql(`update public.staff_mutation set request=${quote(original)}::jsonb where request_id='8f450bc1-d70a-5a4c-828d-87f287dcf1ee';`);
  });
  await t.test("reviewed removal disables RPC while preserving the committed pilot and audit", async () => {
    const before = snapshot();sql(await readFile(REMOVE, "utf8"));
    assert.equal(sql(`select to_regprocedure('public.${RPC}()') is null;`), "t");
    await rejected(null);assert.deepEqual(snapshot(), before);
  });
  t.diagnostic(`Validated ${migrations.length} application migrations on PostgreSQL ${sql("show server_version;")}, GoTrue v2.196.0 and PostgREST v16.2; no hosted access.`);
});
