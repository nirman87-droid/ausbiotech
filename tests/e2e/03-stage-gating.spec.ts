import { expect, test } from "@playwright/test";
import { adminPage, joinAs, links, setStage } from "./helpers";

// Participants can open the current stage and earlier ones, never later ones.
test("later stages are blocked in the page and on the server", async ({ browser }) => {
  const { ctx: adminCtx, page: admin } = await adminPage(browser);
  await setStage(admin, "poll");
  const { page, ctx } = await joinAs(browser, 2, "Demo Contract E");
  const slug = links().slug;

  for (const path of ["problems", "shortlist", "golden", "next"]) {
    await page.goto(`/${slug}/${path}`);
    await expect(page.getByRole("heading", { name: /is not open yet/ })).toBeVisible();
  }
  // The stepper shows later stages as not open, not as links.
  await expect(page.getByRole("navigation", { name: "Workshop stages" }).getByRole("link", { name: /Golden/ })).toHaveCount(0);

  // The server refuses writes for a later stage even if someone calls the API directly.
  const res = await page.request.post("/api/p/save", {
    data: { ops: [{ kind: "problem.create", id: "11111111-1111-4111-8111-111111111111", position: 1 }] },
  });
  const body = await res.json();
  expect(body.results[0]).toMatchObject({ ok: false, error: "This stage is not open yet." });

  // Opening the stage lets them in, without a reload.
  await page.goto(`/${slug}/problems`);
  await setStage(admin, "problems");
  await expect(page.getByRole("heading", { name: "Messy data problems", level: 1 })).toBeVisible({ timeout: 15_000 });

  // Earlier stages stay open.
  await page.goto(`/${slug}/poll`);
  await expect(page.getByRole("heading", { name: "Warm-up poll", level: 1 })).toBeVisible();

  // Without a session or table code, participant pages show nothing.
  const stranger = await browser.newContext();
  const sp = await stranger.newPage();
  await sp.goto(`/${slug}/problems`);
  await expect(sp.getByRole("heading", { name: "Scan the code on your table" })).toBeVisible();
  await sp.goto(`/${slug}/t/not-a-real-token-at-all-123`);
  await expect(sp.getByRole("heading", { name: "Scan the code on your table" })).toBeVisible();
  await stranger.close();

  await ctx.close();
  await adminCtx.close();
});
