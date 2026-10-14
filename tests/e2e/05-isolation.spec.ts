import { expect, test } from "@playwright/test";
import { adminPage, joinAs, links, saved, setStage } from "./helpers";

// A participant can only read and write their own company's data.
test("a participant cannot read or change another company's data", async ({ browser }) => {
  const { ctx: adminCtx, page: admin } = await adminPage(browser);
  await setStage(admin, "shortlist");
  const slug = links().slug;

  const owner = await joinAs(browser, 3, "Demo MedTech I");
  await owner.page.goto(`/${slug}/problems`);
  await owner.page.getByRole("button", { name: "Add your first problem" }).click();
  const secret = "Confidential assay failure rates live in a private spreadsheet";
  await owner.page.getByLabel("In one sentence, what is the problem?").fill(secret);
  await saved(owner.page);
  const headingId = await owner.page.locator("article h2").first().getAttribute("id");
  const problemId = headingId!.replace(/^p-/, "").replace(/-h$/, "");

  const other = await joinAs(browser, 3, "Demo Diagnostics J");
  for (const path of ["problems", "shortlist", "golden", "done", "welcome"]) {
    await other.page.goto(`/${slug}/${path}`);
    await expect(other.page.locator("body")).not.toContainText(secret);
  }

  // Direct writes to the other company's problem are refused.
  const res = await other.page.request.post("/api/p/save", {
    data: {
      ops: [
        { kind: "problem.set", id: problemId, field: "title", value: "Overwritten by someone else" },
        { kind: "problem.set", id: problemId, field: "shortlisted", value: true },
        { kind: "problem.delete", id: problemId },
        { kind: "company.set", field: "golden_problem_id", value: problemId },
      ],
    },
  });
  const { results } = await res.json();
  for (const r of results) expect(r.ok).toBe(false);

  // Creating a problem with the other company's id does not take it over.
  const res2 = await other.page.request.post("/api/p/save", { data: { ops: [{ kind: "problem.create", id: problemId, position: 1 }] } });
  expect((await res2.json()).results[0].ok).toBe(false);

  // The owner's data is unchanged.
  await owner.page.goto(`/${slug}/problems`);
  await expect(owner.page.getByLabel("In one sentence, what is the problem?")).toHaveValue(secret);

  // Without a session the save endpoint refuses everything.
  const anon = await browser.newContext();
  const r3 = await anon.request.post(`${owner.page.url().split("/").slice(0, 3).join("/")}/api/p/save`, {
    data: { ops: [{ kind: "problem.set", id: problemId, field: "title", value: "Anonymous edit attempt" }] },
  });
  expect(r3.status()).toBe(401);
  await anon.close();

  // A tampered session cookie is rejected.
  const cookies = await other.ctx.cookies();
  const session = cookies.find((c) => c.name === "ucb_session")!;
  const forged = await browser.newContext();
  await forged.addCookies([{ ...session, value: session.value.replace(/.$/, (ch) => (ch === "A" ? "B" : "A")) }]);
  const fp = await forged.newPage();
  await fp.goto(`/${slug}/problems`);
  await expect(fp.getByRole("heading", { name: "Scan the code on your table" })).toBeVisible();
  await forged.close();

  await owner.ctx.close();
  await other.ctx.close();
  await adminCtx.close();
});
