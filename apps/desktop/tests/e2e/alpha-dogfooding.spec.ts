import { expect, test } from "@playwright/test";

test("alpha dogfooding flow is navigable", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByText("Desclop", { exact: true })).toBeVisible();

  const hasTauriInternals = await page.evaluate(() => "__TAURI_INTERNALS__" in window);
  const createProject = page.getByRole("button", { name: "Create project" });
  if (await createProject.isVisible().catch(() => false)) {
    await expect(page.getByLabel("Project name")).toBeVisible();
    await expect(page.getByLabel("Local folder path")).toBeVisible();

    if (!hasTauriInternals) {
      await expect(createProject).toBeEnabled();
      return;
    }

    await page.getByLabel("Project name").fill("Desclop");
    await page.getByLabel("Local folder path").fill("/tmp/desclop-alpha-e2e");
    await createProject.click();
  }

  await expect(page.getByRole("button", { name: "Today" })).toBeVisible();

  let seedImportHappened = false;
  const importAction = page.getByRole("button", { name: /Import (Plan|a plan|plan)/ }).first();
  if (await importAction.isVisible().catch(() => false)) {
    await importAction.click();
    await page
      .getByLabel("Markdown plan")
      .fill("## Alpha UX\n- [ ] Restructure Today\n  - [ ] Add current task card");
    await page.getByRole("button", { name: "Preview import" }).click();
    await page.getByRole("button", { name: "Import plan" }).click();
    await page
      .getByRole("button", { name: "Continue Restructure Today" })
      .waitFor({ state: "visible", timeout: 5_000 })
      .then(() => {
        seedImportHappened = true;
      })
      .catch(() => {
        seedImportHappened = false;
      });
  }

  await page.getByRole("button", { name: "Plan", exact: true }).click();
  if (seedImportHappened) {
    await page.getByRole("button", { name: "Continue Restructure Today" }).click();
  } else {
    const continueTasks = page.getByRole("button", { name: /^Continue / });
    await expect(
      continueTasks,
      "no task available for dogfooding path"
    ).not.toHaveCount(0);
    await continueTasks.first().click();
  }
  await page.getByLabel("Next step").fill("Run visual QA");
  await page.getByRole("button", { name: "Save next step" }).click();
  await page.getByLabel("Capture").fill("Check narrow desktop layout");
  await page.getByLabel("Capture type").selectOption("question");
  await page.getByRole("button", { name: "Capture" }).click();
  await page.getByRole("button", { name: "Add manual work review" }).click();
  await page.getByLabel("What was done").fill("Reviewed alpha flow");
  await page.getByLabel("What remains").fill("Run browser screenshots");
  await page.getByLabel("Next step").fill("Capture final screenshots");
  await page.getByRole("button", { name: "Save work review" }).click();
  await page.getByRole("button", { name: "Today" }).click();

  await expect(page.getByRole("heading", { name: /Continue where you left off|Set up Today/ })).toBeVisible();
});
