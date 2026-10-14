import { expect, test } from "@playwright/test";
import { adminPage, joinAs, links, saved, setPoll, setStage } from "./helpers";

// The full participant journey, P1 to P8, for one person.
test("one person goes from the table code to the thank you page", async ({ browser }) => {
  const { ctx: adminCtx, page: admin } = await adminPage(browser);
  await setStage(admin, "arrival");

  // P1 and P2
  const { page, ctx } = await joinAs(browser, 1, "Demo Therapeutics A");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Welcome");
  await expect(page.getByText("We will start soon")).toBeVisible();

  // Confirm details: change the role
  await page.getByLabel("Your role").fill("Head of Operations");
  await saved(page);

  // P3: the welcome page moves on by itself when the poll opens
  await setPoll(admin, true);
  await setStage(admin, "poll");
  await page.waitForURL("**/poll", { timeout: 15_000 });
  await page.getByRole("radio", { name: "Trying free tools" }).check();
  await page.getByRole("radio", { name: "4", exact: true }).check({ force: true });
  await page.getByRole("radio", { name: "Spreadsheets" }).check();
  await page.getByRole("button", { name: "Submit answers" }).click();
  await expect(page.getByText(/Please answer 1 more question/)).toBeVisible();
  await page.getByRole("radio", { name: "Knowing where to start" }).check();
  await page.getByRole("button", { name: "Submit answers" }).click();
  await expect(page.getByText("Thank you. Your answers are in.")).toBeVisible();

  // P4
  await setStage(admin, "problems");
  await page.goto(`/${links().slug}/problems`);
  await page.getByRole("button", { name: "Add your first problem" }).click();
  const titles = page.getByLabel("In one sentence, what is the problem?");
  await titles.first().fill("Batch records are checked by hand against three spreadsheets");
  await page.getByLabel("What happens today?").first().fill("Two QA staff spend a day a week on it.");
  await page.getByRole("button", { name: /Lab data in spreadsheets/ }).click();
  await page.getByRole("button", { name: "Add another problem" }).click();
  await titles.nth(1).fill("Short");
  await page.getByRole("button", { name: "We are done" }).click();
  await expect(page.getByText("Each problem needs a sentence of at least 10 characters.")).toBeVisible();
  await titles.nth(1).fill("Stability study results arrive too late to act on");
  await saved(page);

  // P5: rate both, the automatic pick takes both (fewer than 3)
  await setStage(admin, "shortlist");
  await page.goto(`/${links().slug}/shortlist`);
  const rows = page.locator("article");
  await expect(rows).toHaveCount(2);
  for (let i = 0; i < 2; i++) {
    const row = rows.nth(i);
    await row.locator("fieldset").nth(0).getByText(String(4 - i), { exact: true }).click();
    await row.locator("fieldset").nth(1).getByText("5", { exact: true }).click();
  }
  await rows.first().getByLabel("Builds a foundation").check();
  await saved(page);
  await expect(page.getByText("2 of 2 picked")).toBeVisible();
  await expect(page.locator("[role=meter][aria-label=Score]").first()).toHaveAttribute("aria-valuenow", /\d+/);
  await page.getByRole("button", { name: "Confirm shortlist" }).click();
  await expect(page.getByText("Shortlist confirmed.").first()).toBeVisible();

  // P6
  await setStage(admin, "golden");
  await page.goto(`/${links().slug}/golden`);
  await page.getByRole("radio", { name: /Batch records are checked/ }).check();
  await page.getByLabel(/What is the first small project/).fill("Automatically compare batch records with the three spreadsheets and flag mismatches.");
  await page.getByLabel(/Measure of success/).fill("Hours spent checking batch records each week");
  await page.getByLabel(/Where does the data live/).fill("Excel files on SharePoint");
  await page.getByLabel(/Who will own this project/).fill("Head of Quality");
  await page.getByLabel("We can measure whether it worked").check();
  await expect(page.getByText("All required fields are filled in.")).toBeVisible();
  await saved(page);

  // Switching problems keeps a separate draft for each
  await page.getByRole("radio", { name: /Stability study results/ }).check();
  await expect(page.getByLabel(/What is the first small project/)).toHaveValue("");
  await page.getByRole("radio", { name: /Batch records are checked/ }).check();
  await expect(page.getByLabel(/What is the first small project/)).toHaveValue(/Automatically compare/);
  await saved(page);

  // P7
  await setStage(admin, "next_steps");
  await page.goto(`/${links().slug}/next`);
  await page.getByRole("radio", { name: /Just send me the plan/ }).check();
  await page.getByLabel("When could you start?").selectOption("1 to 3 months");
  await page.getByRole("button", { name: "Finish" }).click();

  // P8
  await page.waitForURL("**/done");
  await expect(page.getByRole("heading", { name: "Batch records are checked by hand against three spreadsheets" })).toBeVisible();
  await expect(page.getByText("Also on your shortlist")).toBeVisible();
  await expect(page.getByText(/By Tuesday 27 October 2026/)).toBeVisible();
  await page.getByText("See all your answers").click();
  await expect(page.getByText("Two QA staff spend a day a week on it.")).toBeVisible();

  // The team sees it on A1
  await admin.goto(`/console/${links().slug}/live`);
  const row = admin.getByRole("row", { name: /Demo Therapeutics A/ });
  await expect(row).toContainText("6/6");

  await ctx.close();
  await adminCtx.close();
});
