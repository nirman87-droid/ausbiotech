import { expect, test } from "@playwright/test";
import { adminPage, joinAs, links, saved, setStage } from "./helpers";

// Two people at the same company editing at the same time.
test("teammates see each other's edits and editing markers live", async ({ browser }) => {
  const { ctx: adminCtx, page: admin } = await adminPage(browser);
  await setStage(admin, "problems");

  const a = await joinAs(browser, 1, "Demo MedTech B");
  const people = await (async () => {
    const p = await a.ctx.newPage();
    await p.goto(`/${links().slug}/welcome`);
    const names = await p.locator("aside li span.font-medium").allTextContents();
    await p.close();
    return names.map((n) => n.replace("(you)", "").trim());
  })();
  const otherName = people.find((n) => n !== a.name)!;
  const b2 = await joinAs(browser, 1, "Demo MedTech B", otherName);

  await a.page.goto(`/${links().slug}/problems`);
  await b2.page.goto(`/${links().slug}/problems`);

  // A creates a problem and writes the title. B sees the card and the text appear.
  await a.page.getByRole("button", { name: "Add your first problem" }).click();
  await a.page.getByLabel("In one sentence, what is the problem?").fill("Supplier certificates are filed by email and lost");
  await saved(a.page);
  await expect(b2.page.getByLabel("In one sentence, what is the problem?")).toHaveValue("Supplier certificates are filed by email and lost", {
    timeout: 15_000,
  });

  // While A has the title field focused, B sees a marker with A's name.
  await a.page.getByLabel("In one sentence, what is the problem?").focus();
  await expect(b2.page.getByText(`${a.name} is editing`)).toBeVisible({ timeout: 15_000 });

  // B edits a different field at the same time. A gets it, and keeps their own title.
  await b2.page.getByLabel("What happens today?").fill("Our QA lead searches inboxes before every audit.");
  await saved(b2.page);
  await a.page.getByLabel("In one sentence, what is the problem?").fill("Supplier certificates are filed by email and often lost");
  await expect(a.page.getByLabel("What happens today?")).toHaveValue("Our QA lead searches inboxes before every audit.", { timeout: 15_000 });
  await saved(a.page);
  await expect(b2.page.getByLabel("In one sentence, what is the problem?")).toHaveValue(
    "Supplier certificates are filed by email and often lost",
    { timeout: 15_000 },
  );

  // Last write wins per field: both write the same field, the later one stays for both.
  await a.page.getByLabel("Who does this work?").fill("QA officer");
  await saved(a.page);
  await b2.page.getByLabel("Who does this work?").fill("Quality lead");
  await saved(b2.page);
  await a.page.getByLabel("What happens today?").focus(); // move focus off the field so A accepts updates
  await expect(a.page.getByLabel("Who does this work?")).toHaveValue("Quality lead", { timeout: 15_000 });

  // Nothing was lost: a fresh load shows the final values.
  const fresh = await b2.ctx.newPage();
  await fresh.goto(`/${links().slug}/problems`);
  await expect(fresh.getByLabel("In one sentence, what is the problem?")).toHaveValue("Supplier certificates are filed by email and often lost");
  await expect(fresh.getByLabel("What happens today?")).toHaveValue("Our QA lead searches inboxes before every audit.");

  await a.ctx.close();
  await b2.ctx.close();
  await adminCtx.close();
});
