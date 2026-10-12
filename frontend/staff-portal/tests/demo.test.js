import { test, expect } from "vitest";
import { createDemoApi } from "../src/demo.js";
test("demo data is ephemeral and roles expose only relevant record types", async () => {
  const first = createDemoApi();
  await first("/auth/login", { body: { role: "doctor" } });
  await first("/patients", {
    method: "POST",
    body: { first_name: "Temporary", last_name: "Test" },
  });
  expect((await first("/patients")).total).toBe(7);
  const second = createDemoApi();
  await second("/auth/login", { body: { role: "pharmacist" } });
  expect((await second("/patients")).total).toBe(6);
  expect(
    (await second("/records")).items.every((r) => r.kind === "prescription"),
  ).toBe(true);
});

test('referral demonstration carries the receiving decision back to the sender', async () => {
  const demo=createDemoApi();
  await demo('/auth/login',{body:{role:'doctor'}});
  const sent=await demo('/transfers',{method:'POST',body:{patient_id:'demo-0',destination_id:'demo-bobo',summary:'Fictional referral summary',consent:true,consent_note:'Fictional authorization note'}});
  await demo('/auth/logout',{method:'POST'});
  await demo('/auth/login',{body:{role:'doctor',receiving:true}});
  expect((await demo('/transfers?offset=0&limit=50')).items[0].id).toBe(sent.id);
  expect((await demo('/patients')).total).toBe(0);
  await demo(`/transfers/${sent.id}`,{method:'PATCH',body:{version:1,status:'accepted'}});
  await demo('/auth/logout',{method:'POST'});
  await demo('/auth/login',{body:{role:'doctor'}});
  expect((await demo('/transfers')).items[0].status).toBe('accepted');
});
