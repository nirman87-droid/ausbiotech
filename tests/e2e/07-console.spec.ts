import { expect, test } from "@playwright/test";
import { adminPage, links } from "./helpers";

test("poll screen hides results until 5 answers and never shows names", async ({ browser }) => {
  const { ctx, page: admin } = await adminPage(browser);
  await admin.goto(`/console/${links().slug}/poll-screen`);
  // Only one person answered the poll in these tests.
  await expect(admin.getByText(/Results appear after 5 answers\. 1 so far\./)).toBeVisible();
  await expect(admin.getByRole("list", { name: "Results" })).toHaveCount(0);
  await ctx.close();
});

test("CSV import maps columns and re-imports without duplicates", async ({ browser }) => {
  const { ctx, page: admin } = await adminPage(browser);
  const slug = links().slug;
  await admin.goto(`/console/${slug}/setup#import`);
  const csv = [
    "Organisation,Full name,Work email,Job title,Employees,State,Table",
    "Import Test Bio,Robin Example,robin@importtest.example,CEO,12,Queensland,7",
    "Import Test Bio,Casey Example,casey@importtest.example,CTO,12,Queensland,7",
    "Big Pharma Example,Jamie Example,jamie@bigpharma.example,Head of Data,500 or more,NSW,",
  ].join("\n");
  const upload = async () => {
    await admin.getByLabel("Registrations CSV").setInputFiles({ name: "rego.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
    const mapping = admin.getByRole("group", { name: "Match your columns" });
    await expect(mapping.getByLabel(/Company name/)).toHaveValue("Organisation");
    await expect(mapping.getByLabel("Email", { exact: true })).toHaveValue("Work email");
    await expect(mapping.getByLabel("Number of staff")).toHaveValue("Employees");
    await admin.getByRole("button", { name: "Import 3 rows" }).click();
  };
  await upload();
  await expect(admin.getByText(/Imported 3 rows: 2 new companies, 1 updated, 3 new people, 0 updated/)).toBeVisible();
  await admin.reload();
  await upload();
  await expect(admin.getByText(/Imported 3 rows: 0 new companies, 3 updated, 0 new people, 3 updated/)).toBeVisible();

  // Checks column flags the large company and the missing table.
  await admin.reload();
  const big = admin.getByRole("row", { name: /Big Pharma Example/ });
  await expect(big).toContainText("Over 200 staff");
  await expect(big).toContainText("No table");
  // Table 7 was created by the import.
  await expect(admin.getByRole("cell", { name: "7", exact: true }).first()).toBeVisible();
  await ctx.close();
});

test("exports, table cards and the HubSpot preview work", async ({ browser }) => {
  const { ctx, page: admin } = await adminPage(browser);
  const slug = links().slug;
  for (const entity of ["combined", "companies", "problems", "facilitator_notes"]) {
    const r = await admin.request.get(`/console/${slug}/export/${entity}`);
    expect(r.status()).toBe(200);
    expect(r.headers()["content-type"]).toContain("text/csv");
  }
  const cards = await admin.request.get(`/console/${slug}/table-cards`);
  expect(cards.headers()["content-type"]).toBe("application/pdf");

  await admin.goto(`/console/${slug}/insights`);
  await expect(admin.getByRole("heading", { name: "Problems by type" })).toBeVisible();
  await admin.getByRole("button", { name: "Preview sync" }).click();
  await expect(admin.getByText(/companies, \d+ contacts \(\d+ people skipped: no consent\)/)).toBeVisible();
  await expect(admin.getByText("HubSpot is not connected.")).toBeVisible();

  // Participants cannot reach the console.
  const anon = await browser.newContext();
  const ap = await anon.newPage();
  await ap.goto(`/console/${slug}/live`);
  await expect(ap).toHaveURL(/\/console\/login/);
  expect((await ap.request.get(`/console/${slug}/export/people`)).status()).toBe(401);
  await anon.close();
  await ctx.close();
});

test("facilitator notes save automatically and show who edited them", async ({ browser }) => {
  const { ctx, page: admin } = await adminPage(browser);
  const slug = links().slug;
  await admin.goto(`/console/${slug}/live`);
  await admin.getByRole("link", { name: "Demo MedTech B" }).click();
  await admin.getByRole("radio", { name: "Hot" }).check();
  await admin.getByLabel("Next action").fill("Call about AI Adopt funding");
  await expect(admin.getByText("All changes saved")).toBeVisible();
  await admin.reload();
  await expect(admin.getByLabel("Next action")).toHaveValue("Call about AI Adopt funding");
  await expect(admin.getByText(/Last edited by Demo Admin/)).toBeVisible();
  await admin.getByRole("button", { name: "Mark shortlist as expert reviewed" }).click();
  await expect(admin.getByText("Marked as expert reviewed.")).toBeVisible();
  await ctx.close();
});

test("facilitators see live and company pages, but not setup, plans or exports", async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const slug = links().slug;
  await page.goto("/console/login");
  await page.getByRole("button", { name: /Demo Facilitator/ }).click();
  await page.waitForURL("**/console");
  await page.goto(`/console/${slug}/live`);
  // Facilitators start filtered to their own tables (tables 1 to 3 in the seed).
  await expect(page.getByLabel("Only my tables")).toBeChecked();
  await expect(page.getByRole("row", { name: /Demo Therapeutics A/ })).toBeVisible();
  await expect(page.getByRole("row", { name: /Demo Therapeutics H/ })).toBeVisible();
  await expect(page.getByRole("row", { name: /Demo Contract M/ })).toHaveCount(0); // table 4
  await expect(page.getByRole("button", { name: /Open next stage/ })).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Event sections" }).getByRole("link", { name: "Plans" })).toHaveCount(0);
  await page.goto(`/console/${slug}/setup`);
  await expect(page).toHaveURL(/denied=1/);
  await page.goto(`/console/${slug}/plans`);
  await expect(page).toHaveURL(/denied=1/);
  expect((await page.request.get(`/console/${slug}/export/people`)).status()).toBe(403);
  await ctx.close();
});
