import { expect, test } from "@playwright/test";
import { adminPage, links, saved, setStage } from "./helpers";

// Changes made after reviewing the real attendee list (20 October).
test("people without a company, name fixes, neutral funding wording and new sectors", async ({ browser }) => {
  const { ctx: adminCtx, page: admin } = await adminPage(browser);
  const slug = links().slug;
  await setStage(admin, "arrival");

  // 1. A person registered with a personal email has no company in the CSV.
  const csv = ["Organisation,Full name,Work email,Table", ",Pat Example,pat.example@gmail.example,1"].join("\n");
  const upload = async () => {
    await admin.goto(`/console/${slug}/setup#import`);
    await admin.getByLabel("Registrations CSV").setInputFiles({ name: "rego.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
    await expect(admin.getByText(/1 rows have no company/)).toBeVisible();
    await admin.getByRole("button", { name: "Import 1 rows" }).click();
  };
  await upload();
  await expect(admin.getByText(/1 people had no company, so each got an "Organisation to confirm" placeholder/)).toBeVisible();
  await admin.goto(`/console/${slug}/live`);
  await expect(admin.getByRole("row", { name: /Organisation to confirm: Pat Example/ })).toContainText("Organisation to confirm");

  // They find the placeholder at their table and are asked for the real organisation name.
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(links().tables[0].path);
  await expect(page.getByRole("heading", { name: "Pick your organisation" })).toBeVisible();
  await page.getByRole("link", { name: /Organisation to confirm: Pat Example/ }).click();
  await page.getByRole("button", { name: /Pat Example/ }).click();
  await page.waitForURL("**/welcome");
  await expect(page.getByText("We do not know which organisation you are from.")).toBeVisible();
  await page.getByLabel("Organisation name").fill("Example Patent Partners");
  // 4. New sectors are offered.
  await page.getByLabel("Sector").selectOption("Professional services");

  // 2. They fix their own name.
  await page.getByLabel("Your name").fill("Patricia Example");
  await saved(page);
  await page.reload();
  await expect(page.getByText("Signed in as Patricia Example")).toBeVisible();
  await expect(page.getByText("Example Patent Partners").first()).toBeVisible();
  await expect(page.getByText("We do not know which organisation you are from.")).toHaveCount(0);

  // The staff flag clears once the organisation has a real name.
  await admin.goto(`/console/${slug}/live`);
  const row = admin.getByRole("row", { name: /Example Patent Partners/ });
  await expect(row).toBeVisible();
  await expect(row).not.toContainText("Organisation to confirm");

  // Re-importing the same CSV does not pull them back into a placeholder.
  await upload();
  await expect(admin.getByText(/0 new people, 1 updated/)).toBeVisible();
  await admin.goto(`/console/${slug}/live`);
  await expect(admin.getByRole("row", { name: /Organisation to confirm: Pat Example/ })).toHaveCount(0);

  // 3. The funding choice is neutral and the consent text does not name a program.
  await setStage(admin, "next_steps");
  await page.goto(`/${slug}/next`);
  await expect(page.getByRole("radio", { name: /Explore funding options/ })).toBeVisible();
  await expect(page.locator("main")).not.toContainText("AI Adopt");

  await ctx.close();
  await adminCtx.close();
});
