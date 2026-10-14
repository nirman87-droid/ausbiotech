import crypto from "node:crypto";
import { expect, test } from "@playwright/test";
import { adminPage, links } from "./helpers";

// Same signing as lib/sign.ts with the local development secret.
function personToken(personId: string) {
  const payload = Buffer.from(JSON.stringify({ p: personId, e: Date.now() + 86_400_000 })).toString("base64url");
  const mac = crypto.createHmac("sha256", "local-development-secret-do-not-use-in-production").update(payload).digest("base64url");
  return `${payload}.${mac}`;
}

// A5 then P9: review, mark ready, send, open the personal link, re-send as a new version.
test("staff send a final plan and the participant opens it", async ({ browser }) => {
  const { ctx, page: admin } = await adminPage(browser);
  const slug = links().slug;

  await admin.goto(`/console/${slug}/plans`);
  await admin.getByRole("link", { name: /Demo Therapeutics A/ }).click();
  // Version 1 is pre-filled from the golden draft written in the happy path test.
  await expect(admin.getByLabel("Plan title")).toHaveValue("Batch records are checked by hand against three spreadsheets");
  await expect(admin.getByLabel("Measure", { exact: true })).toHaveValue("Hours spent checking batch records each week");
  await expect(admin.getByRole("button", { name: /^Send to/ })).toBeDisabled();

  await admin.getByLabel("Recommendation").fill("Start with a four week pilot on one product line. Compare results with the manual check.");
  await admin.getByLabel("Risks and how to manage them").fill("Spreadsheet formats change. Agree a fixed template first.");
  await admin.getByRole("button", { name: "Save draft" }).click();
  await expect(admin.getByText("Saved.")).toBeVisible();
  await admin.getByRole("button", { name: "Mark ready" }).click();
  await expect(admin.getByText("Marked ready.")).toBeVisible();

  const pdf = await admin.request.get(admin.url().replace(/plans\?c=([0-9a-f-]+)/, "plans/$1/pdf"));
  expect(pdf.headers()["content-type"]).toBe("application/pdf");

  await admin.getByRole("button", { name: /^Send to/ }).click();
  await expect(admin.getByText(/Sent to \d+ people \(logged only/)).toBeVisible();

  // Find a person at the company from the people export, and open their personal link.
  const csv = await (await admin.request.get(`/console/${slug}/export/people`)).text();
  const line = csv.split("\r\n").find((l) => l.includes(",Demo Therapeutics A,"))!;
  const personId = line.split(",")[0].replace("﻿", "");
  const participant = await browser.newContext();
  const p = await participant.newPage();
  await p.goto(`/plan/${personToken(personId)}`);
  await expect(p.getByRole("heading", { level: 1 })).toHaveText("Batch records are checked by hand against three spreadsheets");
  await expect(p.getByText("Start with a four week pilot")).toBeVisible();
  await expect(p.locator("body")).not.toContainText("Facilitator");
  const dl = await p.request.get(`/plan/${personToken(personId)}/pdf`);
  expect(dl.status()).toBe(200);
  expect((await dl.body()).subarray(0, 4).toString()).toBe("%PDF");

  // Opening is recorded.
  await admin.reload();
  await expect(admin.getByText(/Version 1: sent .*, opened/)).toBeVisible();

  // Editing after a send creates version 2. Sending it is an update.
  await admin.getByLabel("Target").fill("Half the hours within three months");
  await admin.getByRole("button", { name: "Save draft" }).click();
  await expect(admin.getByText("Version 2")).toBeVisible();
  await admin.getByRole("button", { name: "Mark ready" }).click();
  await expect(admin.getByText("Marked ready.")).toBeVisible();
  await admin.getByRole("button", { name: /^Send to/ }).click();
  await expect(admin.getByText(/Update sent to/)).toBeVisible();
  await p.reload();
  await expect(p.getByText("Half the hours within three months")).toBeVisible();

  // A forged or expired link shows nothing.
  await p.goto(`/plan/${personToken(personId).slice(0, -2)}xx`);
  await expect(p.getByRole("heading", { name: /expired or is not valid/ })).toBeVisible();

  await participant.close();
  await ctx.close();
});
