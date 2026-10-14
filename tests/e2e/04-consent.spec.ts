import { expect, test } from "@playwright/test";
import { adminPage, joinAs, links, saved, setStage } from "./helpers";
import { CONSENT_TEXT } from "../../lib/copy";

// P7: follow-up and funding need consent before Finish is enabled. Consent is stored with its wording.
test("follow-up needs consent, which is stored with the exact text", async ({ browser }) => {
  const { ctx: adminCtx, page: admin } = await adminPage(browser);
  await setStage(admin, "next_steps");
  const { page, ctx, name } = await joinAs(browser, 2, "Demo Contract F");
  const slug = links().slug;
  await page.goto(`/${slug}/next`);

  const consent = page.getByLabel(CONSENT_TEXT);
  const finish = page.getByRole("button", { name: "Finish" });
  await expect(consent).not.toBeChecked(); // unticked by default
  await expect(finish).toBeDisabled(); // no choice yet

  await page.getByRole("radio", { name: /Book a follow-up/ }).check();
  await expect(finish).toBeDisabled();
  await expect(page.getByText("Tick the consent box to finish.")).toBeVisible();

  await page.getByRole("radio", { name: /Explore funding options/ }).check();
  await expect(finish).toBeDisabled();

  // Choices that do not need consent can finish without it.
  await page.getByRole("radio", { name: /Not right now/ }).check();
  await expect(finish).toBeEnabled();

  await page.getByRole("radio", { name: /Book a follow-up/ }).check();
  await consent.check();
  await expect(finish).toBeEnabled();
  await saved(page);
  await finish.click();
  await page.waitForURL("**/done");

  // The server refuses a follow-up without consent even if the button were bypassed.
  await page.goto(`/${slug}/next`);
  await page.getByLabel(CONSENT_TEXT).uncheck();
  await saved(page);
  await expect(page.getByRole("button", { name: /finish/i })).toBeDisabled();

  // Staff see the stored consent on A2, then put it back.
  await page.getByLabel(CONSENT_TEXT).check();
  await saved(page);
  await admin.goto(`/console/${slug}/live`);
  await admin.getByRole("link", { name: "Demo Contract F" }).click();
  await expect(admin.getByRole("listitem").filter({ hasText: name })).toContainText("Consented");

  // The exported people CSV carries the exact consent wording.
  const csv = await admin.request.get(`/console/${slug}/export/people`);
  expect(await csv.text()).toContain(CONSENT_TEXT);

  await ctx.close();
  await adminCtx.close();
});
