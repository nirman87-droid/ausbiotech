import fs from "node:fs";
import path from "node:path";
import { expect, type Browser, type BrowserContext, type Page } from "@playwright/test";

export type Links = { slug: string; tables: { table: number; token: string; path: string }[] };

export function links(): Links {
  return JSON.parse(fs.readFileSync(path.join(process.cwd(), ".data", "e2e-links.json"), "utf8"));
}

export const STAGE_LABELS: Record<string, string> = {
  arrival: "Welcome",
  poll: "Warm-up poll",
  problems: "Messy data problems",
  shortlist: "Shortlist to three",
  golden: "Golden use case",
  next_steps: "Next steps",
  done: "Thank you",
};

// A signed-in admin page, using the local dev sign in.
export async function adminPage(browser: Browser): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  page.on("dialog", (d) => d.accept());
  await page.goto("/console/login");
  await page.getByRole("button", { name: /Demo Admin/ }).click();
  await page.waitForURL("**/console");
  return { ctx, page };
}

export async function setStage(admin: Page, stage: keyof typeof STAGE_LABELS) {
  const { slug } = links();
  await admin.goto(`/console/${slug}/live`);
  const current = admin.locator("section[aria-label='Room controls'] p.text-2xl");
  if ((await current.textContent())?.trim() === STAGE_LABELS[stage]) return;
  await admin.getByLabel("Jump to stage").selectOption(stage);
  await admin.getByRole("button", { name: "Set stage" }).click();
  await expect(current).toHaveText(STAGE_LABELS[stage]);
}

export async function setPoll(admin: Page, open: boolean) {
  const { slug } = links();
  await admin.goto(`/console/${slug}/live`);
  const button = admin.getByRole("button", { name: open ? "Open poll" : "Close poll" });
  if (await button.isVisible()) {
    await button.click();
    await expect(admin.getByRole("button", { name: open ? "Close poll" : "Open poll" })).toBeVisible();
  }
}

// Scans a table code, picks a company and a person. Returns the participant page.
export async function joinAs(browser: Browser, table: number, company: string, person?: string): Promise<{ ctx: BrowserContext; page: Page; name: string }> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  page.on("dialog", (d) => d.accept());
  const t = links().tables.find((x) => x.table === table)!;
  await page.goto(t.path);
  await page.getByRole("link", { name: new RegExp(company) }).click();
  await page.waitForURL("**/who");
  const cards = page.getByRole("list", { name: "Registered people" }).getByRole("button");
  const card = person ? cards.filter({ hasText: person }) : cards.first();
  const name = (await card.locator("span span").first().textContent())!.trim();
  await card.click();
  const confirm = page.getByRole("button", { name: /Yes, continue as/ });
  await page.waitForURL(/\/(welcome|who\?already)/);
  if (await confirm.isVisible().catch(() => false)) await confirm.click();
  await page.waitForURL("**/welcome");
  return { ctx, page, name };
}

export async function saved(page: Page) {
  await expect(page.getByRole("status").filter({ hasText: /All changes saved/ })).toBeVisible();
}
