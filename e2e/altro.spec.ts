/**
 * QA T17c: Altro (plan rows "Temi", "Promemoria", "Suggerimenti", "Esci").
 *
 * AC map
 *  - AC49  the couple's theme is chosen in Aspetto, saved on the WEDDING, applied at once and seen
 *          by the other partner; 12 themes are offered
 *  - AC52  Promemoria: two switches, each person decides for themselves
 *  - AC16/AC48  changing the rite in Impostazioni leaves tasks untouched and offers
 *          "Suggerimenti da rivedere" in the Percorso (nothing added or removed by itself)
 *  - AC46  Profili: label, first and last name editable by either partner for both, no date of birth
 *  - AC44  Info shows the app version and the heartbeat of the daily job
 *  - AC62  "Esci" is in the index
 */
import { loginAs } from "./support/auth";
import { expect, newSession, serviceClient, test, uniqueIp } from "./support/fixtures";
import { seedWedding } from "./support/seed";

test.describe.configure({ timeout: 60_000 });

test("the index lists every area and 'Esci'", async ({ page }) => {
  const w = await seedWedding();
  await loginAs(page, w.wedding.founder, uniqueIp());
  await page.goto("/altro");
  for (const name of [
    "Il tuo accesso",
    "Profili",
    "Impostazioni nozze",
    "Invito al partner",
    "Aspetto",
    "Promemoria email",
    "Esportazione",
    "Info",
  ]) {
    await expect(page.getByRole("link", { name: new RegExp(name) })).toBeVisible();
  }
  await expect(page.getByTestId("sign-out")).toBeVisible();
});

test("Aspetto: 12 themes, chosen for the couple, seen by the partner (AC49)", async ({
  page,
  browser,
}, testInfo) => {
  const w = await seedWedding();
  await loginAs(page, w.wedding.founder, uniqueIp());
  await page.goto("/altro/aspetto");
  await expect(page.getByRole("radiogroup", { name: "Tema" }).getByRole("radio")).toHaveCount(12);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "giardino");
  await page.getByRole("radio", { name: /Toscana/ }).click();
  // provisional first: applied to the whole interface, "Nulla è salvato"
  await expect(page.locator("html")).toHaveAttribute("data-theme", "toscana");
  await page.getByRole("button", { name: "Annulla" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "giardino");
  await page.getByRole("radio", { name: /Toscana/ }).click();
  await page.getByRole("button", { name: "Usa questo tema" }).click();
  await expect(page.getByText("Tema applicato.").first()).toBeVisible();
  const saved = await serviceClient()
    .from("weddings")
    .select("theme_id")
    .eq("id", w.weddingId)
    .single();
  expect(saved.data?.theme_id).toBe("toscana");

  const b = await newSession(browser, testInfo);
  await loginAs(b.page, w.partnerB!.user, uniqueIp());
  await expect(b.page.locator("html")).toHaveAttribute("data-theme", "toscana");
  await b.context.close();
});

test("Promemoria: each person decides for themselves (AC52)", async ({
  page,
  browser,
}, testInfo) => {
  const w = await seedWedding();
  await loginAs(page, w.wedding.founder, uniqueIp());
  await page.goto("/altro/promemoria");
  const reminders = page.getByTestId("pref-reminders");
  const digest = page.getByTestId("pref-digest");
  await expect(reminders).toBeChecked();
  await expect(digest).toBeChecked();
  await reminders.click();
  await expect(reminders).not.toBeChecked();
  // wait for the save (the switch is optimistic) before reloading
  await expect
    .poll(
      async () =>
        (
          await serviceClient()
            .from("notification_preferences")
            .select("reminders_enabled")
            .eq("user_id", w.wedding.founder.id)
            .maybeSingle()
        ).data?.reminders_enabled,
      { timeout: 10_000 },
    )
    .toBe(false);
  await page.reload();
  await expect(page.getByTestId("pref-reminders")).not.toBeChecked();
  await expect(page.getByTestId("pref-digest")).toBeChecked();

  const b = await newSession(browser, testInfo);
  await loginAs(b.page, w.partnerB!.user, uniqueIp());
  await b.page.goto("/altro/promemoria");
  await expect(b.page.getByTestId("pref-reminders")).toBeChecked();
  await expect(
    b.page.getByText("Le email di accesso e di invito non si possono disattivare."),
  ).toBeVisible();
  await b.context.close();
});

test("Impostazioni: a new rite proposes suggestions and changes nothing by itself (AC16, AC48)", async ({
  page,
}) => {
  const w = await seedWedding({
    rite: "civile",
    scenarios: [{ kind: "fixed", date_from: "2028-09-02" }],
  });
  const before = await serviceClient()
    .from("tasks")
    .select("id", { count: "exact", head: true })
    .eq("wedding_id", w.weddingId)
    .is("deleted_at", null);
  await loginAs(page, w.wedding.founder, uniqueIp());
  await page.goto("/altro/impostazioni");
  await page.getByTestId("settings-rite").getByTestId("choice-religioso").click();
  await page.getByTestId("settings-save").click();
  await expect(page.getByText("Salvato.").first()).toBeVisible();
  const after = await serviceClient()
    .from("tasks")
    .select("id", { count: "exact", head: true })
    .eq("wedding_id", w.weddingId)
    .is("deleted_at", null);
  expect(after.count).toBe(before.count);

  await page.goto("/percorso");
  const card = page.getByTestId("suggestions-card");
  await expect(card).toBeVisible();
  await expect(card).toContainText(/Nuova tappa|non più pertinente|Da rivedere/i);
  // accepting is a deliberate act: only then a task is added
  await card.getByRole("button", { name: "Aggiungi al Percorso" }).first().click();
  await expect
    .poll(
      async () =>
        (
          await serviceClient()
            .from("tasks")
            .select("id", { count: "exact", head: true })
            .eq("wedding_id", w.weddingId)
            .is("deleted_at", null)
        ).count,
    )
    .toBe((before.count ?? 0) + 1);
  // ignoring never comes back
  const remaining = await card.getByRole("button", { name: "Ignora" }).count();
  if (remaining > 0) {
    await card.getByRole("button", { name: "Ignora" }).first().click();
    await page.reload();
    const again = await page.getByRole("button", { name: "Ignora" }).count();
    expect(again).toBeLessThan(remaining);
  }
});

test("Profili: either partner edits both names; no date of birth anywhere (AC46)", async ({
  page,
}) => {
  const w = await seedWedding({ names: { a: "Tony", b: "Jessica" } });
  await loginAs(page, w.partnerB!.user, uniqueIp());
  await page.goto("/altro/profili");
  expect(await page.getByLabel(/nascita|compleanno|birth/i).count()).toBe(0);
  const partnerForm = page.getByTestId("profile-partner-form");
  await partnerForm.getByLabel("Cognome").fill("Verdi");
  await page.getByTestId("profile-partner-save").click();
  await expect(page.getByText("Salvato.").first()).toBeVisible();
  const row = await serviceClient()
    .from("wedding_partners")
    .select("last_name")
    .eq("wedding_id", w.weddingId)
    .eq("slot", "A")
    .single();
  expect(row.data?.last_name).toBe("Verdi");
});

test("Info: version and the heartbeat of the daily job (AC44)", async ({ page }) => {
  const w = await seedWedding();
  await loginAs(page, w.wedding.founder, uniqueIp());
  await page.goto("/altro/info");
  await expect(page.getByTestId("info-app-name")).toHaveText(/roadmap2yes/i);
  await expect(page.getByTestId("info-version")).toHaveText(/^\d+\.\d+\.\d+/);
  await expect(page.getByTestId("info-heartbeat")).toBeVisible();
});
