import assert from "node:assert/strict";
import { test } from "node:test";
import { createTestDatabase } from "./database-helper.mjs";
import { gisLogin, seedGisFixtures } from "./gis-fixtures.mjs";

test("local example status changes protect reviewed plots and keep mausoleums together", async t => {
  const db = await createTestDatabase({ throughMigration: "20261127040000_local_review_status_updates.sql" });
  t.after(() => db.close());
  await seedGisFixtures(db);
  await db.exec(`create schema phase2_review;
    create table phase2_review.plot_draft (garden text, sector text, row_number text, cad_candidate text,
      test_status text, review_availability text, proposed_code text, lot_type text, review_status text);
    insert into phase2_review.plot_draft values ('Butterfly','A','1','lawn:99991','available',null,'BPG-A-1-1','Standard','draft');
    insert into phase2_review.plot_draft values ('Butterfly','A','1','lawn:99992','available','temporarily_unavailable','BPG-A-1-2','Premium','draft');
    insert into phase2_review.plot_draft select 'Majestic Palm Court','C','1','estates:' || x,'available',null,'MPC-C-1-12','Mausoleum space','draft' from generate_series(90001,90012) x;`);
  const hash = "02a4dba490872f9be8cf56280ccf432d31796431c1f808f542fbff86ac28ca77";
  const change = (candidate, expected, status) => db.query("select public.staff_update_review_status($1,$2,$3,$4)", [candidate, hash, expected, status]);
  await assert.rejects(change("lawn:99991", "available", "booked"), /staff/i);
  await gisLogin(db);
  await change("lawn:99991", "available", "booked");
  await assert.rejects(change("lawn:99991", "available", "hold"), /changed or plot needs review/i);
  await assert.rejects(change("lawn:99992", "available", "booked"), /needs review/i);
  await change("estates:90001", "available", "unavailable");
  const statuses = (await db.query("select public.staff_planning_plot_statuses($1) value", [hash])).rows[0].value;
  assert.ok(statuses.booked.includes("lawn:99991"));
  for (let i = 90001; i <= 90012; i++) assert.ok(statuses.unavailable.includes(`estates:${i}`));
});
