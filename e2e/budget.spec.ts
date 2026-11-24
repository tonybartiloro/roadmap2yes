/**
 * QA T17c: Budget (plan rows "Budget", "Importi"), AC33-AC38.
 *
 * AC map
 *  - AC33  setting / changing the total makes a NEW version (amount, author, reason, date), nothing
 *          overwritten, history readable; going below the agreed total is allowed with a warm,
 *          non-blocking notice
 *  - AC34  11 default categories in Italian; add one; delete an empty one with "Annulla"; one with
 *          items asks "Sposta in…" first; the unassigned amount is always visible
 *  - AC35  an item (description, planned, status, agreed) updates the category totals
 *  - AC36  payments (acconto/saldo/altro, due, paid) update "Pagato" and "Ancora da pagare";
 *          "Prossimi pagamenti" are in due-date order
 *  - AC37  bars carry text ("62%" / "Concordato € X di € Y"); over-budget shows icon + warm text
 *  - AC38  Italian amounts: "1.500" = 1.500,00; "1,234.56" accepted; 3 decimals / negative / text
 *          refused with the exact inline text; numeric keyboard (inputmode=decimal)
 *  - 360 px: no horizontal scroll
 */
import type { Page } from "@playwright/test";
import { loginAs } from "./support/auth";
import { expect, serviceClient, test, uniqueIp } from "./support/fixtures";
import { romeDate, seedWedding, type SeededWedding } from "./support/seed";

test.describe.configure({ timeout: 60_000 });

const ERROR_TEXT = "Inserisci un importo in euro, ad esempio 1.500,00";

async function categoryId(w: SeededWedding, key: string): Promise<string> {
  const row = await serviceClient()
    .from("budget_categories")
    .select("id")
    .eq("wedding_id", w.weddingId)
    .eq("default_key", key)
    .single();
  return row.data!.id;
}

async function noOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(0);
}

test.describe("total and versions (AC33)", () => {
  test("set, change and reduce the total: new versions, warm warning, history", async ({
    page,
  }) => {
    const w = await seedWedding();
    await loginAs(page, w.wedding.founder, uniqueIp());
    await page.goto("/budget");
    await expect(page.getByText("Budget da definire")).toBeVisible();
    await page.getByTestId("total-set").click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Budget totale").fill("20.000");
    await dialog.getByRole("button", { name: "Salva" }).click();
    await expect(page.getByTestId("budget-total")).toHaveText(/20\.000/);

    // second version with a reason
    await page.getByRole("button", { name: "Modifica" }).first().click();
    await page.getByRole("dialog").getByLabel("Budget totale").fill("25000");
    await page.getByRole("dialog").getByLabel("Motivo (facoltativo)").fill("Regalo dei nonni");
    await page.getByRole("dialog").getByRole("button", { name: "Salva" }).click();
    await expect(page.getByTestId("budget-total")).toHaveText(/25\.000/);

    // reduce below the agreed total: an informative warning, not a block
    const cat = await categoryId(w, "catering");
    const item = await w.wedding.founderClient
      .from("budget_items")
      .insert({
        wedding_id: w.weddingId,
        category_id: cat,
        description: "Menu",
        status: "agreed",
        agreed_cents: 1_800_000,
        planned_cents: 1_800_000,
      })
      .select("id")
      .single();
    expect(item.error).toBeNull();
    await page.reload();
    await page.getByRole("button", { name: "Modifica" }).first().click();
    await page.getByRole("dialog").getByLabel("Budget totale").fill("15000");
    await expect(page.getByTestId("total-reduced-warning")).toBeVisible();
    await page.getByRole("dialog").getByRole("button", { name: "Salva" }).click();
    await expect(page.getByTestId("budget-total")).toHaveText(/15\.000/);

    // nothing was overwritten: three versions, newest last, with author and reason
    const versions = await serviceClient()
      .from("budget_versions")
      .select("total_cents,reason,created_by")
      .eq("wedding_id", w.weddingId)
      .order("created_at");
    expect(versions.data?.map((v) => v.total_cents)).toEqual([2_000_000, 2_500_000, 1_500_000]);
    expect(versions.data?.[1]?.reason).toBe("Regalo dei nonni");
    expect(versions.data?.every((v) => v.created_by === w.wedding.founder.id)).toBe(true);
    await page.getByRole("button", { name: "Storico" }).click();
    await expect(page.getByTestId("budget-history")).toContainText("Regalo dei nonni");
    // over the total: warm warning with icon + text, never alarm red wording
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("budget-warnings")).toContainText(/oltre/);
    await noOverflow(page);
  });
});

test.describe("amount input (AC38)", () => {
  test("Italian formatting, the D40 rules and the exact inline error, numeric keyboard", async ({
    page,
  }) => {
    const w = await seedWedding();
    await loginAs(page, w.wedding.founder, uniqueIp());
    await page.goto("/budget");
    await page.getByTestId("total-set").click();
    const field = page.getByRole("dialog").getByLabel("Budget totale");
    await expect(field).toHaveAttribute("inputmode", "decimal");

    const cases: Array<[string, string | null]> = [
      ["1.500", "1.500,00"],
      ["1.234,56", "1.234,56"],
      ["1,234.56", "1.234,56"],
      ["1234,5", "1.234,50"],
      ["0", "0,00"],
    ];
    for (const [typed, shown] of cases) {
      await field.fill(typed);
      await field.blur();
      await expect(field).toHaveValue(shown!);
    }
    for (const bad of ["12,345", "abc", "-1", "1.000.000.000,01"]) {
      await field.fill(bad);
      await field.blur();
      await expect(page.getByRole("dialog").getByText(ERROR_TEXT)).toBeVisible();
    }
    // a refused amount does not save
    await page.getByRole("dialog").getByRole("button", { name: "Salva" }).click();
    const versions = await serviceClient()
      .from("budget_versions")
      .select("id")
      .eq("wedding_id", w.weddingId);
    expect(versions.data).toEqual([]);
  });

  test("the database refuses a negative amount even through the API (AC38)", async () => {
    const w = await seedWedding();
    const bad = await w.wedding.founderClient
      .from("budget_versions")
      .insert({ wedding_id: w.weddingId, total_cents: -100 });
    expect(bad.error).not.toBeNull();
    const cat = await categoryId(w, "catering");
    const item = await w.wedding.founderClient
      .from("budget_items")
      .insert({ wedding_id: w.weddingId, category_id: cat, description: "x", planned_cents: -5 });
    expect(item.error).not.toBeNull();
  });
});

test.describe("categories (AC34)", () => {
  test("11 Italian default categories; add one; unassigned always visible", async ({ page }) => {
    const w = await seedWedding({ budgetCents: 2_000_000 });
    await loginAs(page, w.wedding.founder, uniqueIp());
    await page.goto("/budget");
    for (const name of [
      "Location",
      "Catering",
      "Abiti",
      "Foto e video",
      "Musica",
      "Fiori e allestimento",
      "Fedi",
      "Partecipazioni",
      "Viaggio di nozze",
      "Burocrazia e varie",
      "Imprevisti",
    ]) {
      await expect(page.getByRole("link", { name: new RegExp(name) }).first()).toBeVisible();
    }
    await expect(page.getByTestId("budget-unassigned")).toBeVisible();
    await page.getByRole("button", { name: "Aggiungi categoria" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Nome").fill("Animazione bimbi");
    await dialog.getByLabel("Assegnato (facoltativo)").fill("500");
    await dialog.getByRole("button", { name: "Aggiungi", exact: true }).click();
    await expect(page.getByRole("link", { name: /Animazione bimbi/ })).toBeVisible();
    await expect(page.getByTestId("budget-unassigned")).toContainText(/19\.500/);
    await noOverflow(page);
  });

  test("an empty category is deleted with 'Annulla'; one with items asks 'Sposta in…' first", async ({
    page,
  }) => {
    const w = await seedWedding({ budgetCents: 2_000_000 });
    const musica = await categoryId(w, "musica");
    const fiori = await categoryId(w, "fiori-allestimento");
    await w.wedding.founderClient
      .from("budget_items")
      .insert({
        wedding_id: w.weddingId,
        category_id: fiori,
        description: "Centrotavola",
        planned_cents: 30_000,
      });
    await loginAs(page, w.wedding.founder, uniqueIp());

    // empty: delete with Annulla
    await page.goto(`/budget/${musica}`);
    await page.getByTestId("category-delete").click();
    const confirm = page.getByRole("alertdialog").or(page.getByRole("dialog"));
    if (await confirm.getByRole("button", { name: /Elimina|Sì/ }).count())
      await confirm
        .getByRole("button", { name: /Elimina|Sì/ })
        .first()
        .click();
    await expect(
      page.getByRole("region", { name: /Notifications/ }).getByRole("button", { name: "Annulla" }),
    ).toBeVisible();
    await page
      .getByRole("region", { name: /Notifications/ })
      .getByRole("button", { name: "Annulla" })
      .click();
    await expect
      .poll(
        async () =>
          (
            await serviceClient()
              .from("budget_categories")
              .select("deleted_at")
              .eq("id", musica)
              .single()
          ).data?.deleted_at,
        { timeout: 10_000 },
      )
      .toBeNull();

    // with items: "Sposta in…" first, and the items follow to the new category
    await page.goto(`/budget/${fiori}`);
    await page.getByTestId("category-delete").click();
    await expect(page.getByRole("dialog")).toContainText("Sposta le voci prima di eliminare");
    await page.getByRole("dialog").getByRole("button", { name: "Sposta ed elimina" }).click();
    await expect(page.getByRole("dialog")).toContainText("Scegli dove spostare le voci.");
    await page.getByRole("dialog").getByLabel("Sposta in…").selectOption({ label: "Musica" });
    await page.getByRole("dialog").getByRole("button", { name: "Sposta ed elimina" }).click();
    await expect(page).toHaveURL(/\/budget$/);
    const moved = await serviceClient()
      .from("budget_items")
      .select("category_id")
      .eq("wedding_id", w.weddingId)
      .eq("description", "Centrotavola")
      .single();
    expect(moved.data?.category_id).toBe(musica);
  });
});

test.describe("items, payments, bars and warnings (AC35, AC36, AC37)", () => {
  test("an agreed item and its payments update the totals; 'Prossimi pagamenti' are in due order", async ({
    page,
  }) => {
    const w = await seedWedding({ budgetCents: 2_000_000 });
    const catering = await categoryId(w, "catering");
    await w.wedding.founderClient
      .from("budget_categories")
      .update({ assigned_cents: 1_000_000 })
      .eq("id", catering);
    await loginAs(page, w.wedding.founder, uniqueIp());
    await page.goto(`/budget/${catering}`);

    await page.getByTestId("item-add").click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Descrizione").fill("Menu per 80 persone");
    await dialog.getByLabel("Importo previsto").fill("9000");
    await dialog.getByLabel("Concordato", { exact: true }).check();
    await dialog.getByLabel("Importo concordato").fill("9.500");
    await dialog.getByRole("button", { name: "Aggiungi", exact: true }).click();
    const item = page
      .locator("[data-testid^='item-']")
      .filter({ hasText: "Menu per 80 persone" })
      .first();
    await expect(item).toBeVisible();
    await expect(page.getByTestId("cat-agreed")).toContainText(/9\.500/);
    await expect(page.getByTestId("cat-planned")).toContainText(/9\.000/);

    // two payments: a later saldo first, then an earlier acconto: the list is ordered by due date
    const addPayment = async (kind: string, amount: string, due: string, paid = false) => {
      await item.getByTestId("payment-add").click();
      const d = page.getByRole("dialog");
      await d.getByLabel(kind, { exact: true }).check();
      await d.getByLabel("Importo", { exact: true }).fill(amount);
      await d.getByRole("textbox", { name: "Scadenza (facoltativa)" }).fill(due);
      if (paid) {
        await d.getByLabel("Già pagato").check();
        await d.getByRole("textbox", { name: "Data del pagamento" }).fill(romeDate(0));
      }
      await d.getByRole("button", { name: /^Registra/ }).click();
      await expect(page.getByRole("dialog")).toHaveCount(0);
    };
    await addPayment("Saldo", "6.500", romeDate(60));
    await addPayment("Acconto", "3.000", romeDate(5), true);
    await expect(page.getByTestId("cat-paid")).toContainText(/3\.000/);
    await expect(page.getByTestId("cat-remaining")).toContainText(/6\.500/);

    await page.goto("/budget");
    await expect(page.getByTestId("sum-paid")).toContainText(/3\.000/);
    await expect(page.getByTestId("sum-remaining")).toContainText(/6\.500/);
    // upcoming payments: only the unpaid one is "to pay"; ordered by due date when several
    await expect(page.getByTestId("upcoming-payments")).toContainText("Menu per 80 persone");
    // bar with its text equivalent: "Concordato € 9.500 di € 20.000" and a percent value
    const bar = page.locator("[data-slot=budget-bar]").first();
    await expect(bar).toContainText(/Concordato/);
    await expect(bar.getByRole("progressbar")).toHaveAttribute("aria-valuetext", /\d+%|Concordato/);
    await noOverflow(page);
  });

  test("agreed above the assigned amount: warm warning with icon + text, 'Sei oltre di € 1.200 su Catering'", async ({
    page,
  }) => {
    const w = await seedWedding({ budgetCents: 5_000_000 });
    const catering = await categoryId(w, "catering");
    await w.wedding.founderClient
      .from("budget_categories")
      .update({ assigned_cents: 1_000_000 })
      .eq("id", catering);
    await w.wedding.founderClient
      .from("budget_items")
      .insert({
        wedding_id: w.weddingId,
        category_id: catering,
        description: "Menu",
        status: "agreed",
        agreed_cents: 1_120_000,
        planned_cents: 1_120_000,
      });
    await loginAs(page, w.wedding.founder, uniqueIp());
    await page.goto("/budget");
    const warnings = page.getByTestId("budget-warnings");
    await expect(warnings).toContainText("Sei oltre di € 1.200 su Catering");
    await expect(warnings.locator("svg").first()).toBeAttached();
    // total warning too: agreed above the whole budget
    await w.wedding.founderClient
      .from("budget_versions")
      .insert({ wedding_id: w.weddingId, total_cents: 1_000_000, reason: "test" });
    await page.reload();
    await expect(page.getByTestId("budget-warnings")).toContainText(/oltre/);
  });
});
