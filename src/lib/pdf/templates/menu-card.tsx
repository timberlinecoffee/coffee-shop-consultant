// TIM-708: menu_card_with_cost_analysis PDF template.
// Page 1 — public menu (items + prices grouped by category, customer-facing).
// Page 2 — operator view (price + cogs + margin% + mix + margin contribution per 100 covers).
// Data is row-based (menu_items table), so we use the dataLoader hook.

import React from "react"
import { Page, View, Text, StyleSheet } from "@react-pdf/renderer"
import { BRAND, type BrandTokens } from "../brand"
import { PdfDocument } from "../components/PdfDocument"
import { PdfHeader } from "../components/PdfHeader"
import { PdfFooter } from "../components/PdfFooter"
import { PdfSection } from "../components/PdfSection"
import { PdfTable, type ColumnDef, type Row } from "../components/PdfTable"
import type { PdfTemplate } from "../registry"
import { formatMinorUnits } from "@/lib/currency"

// ── types ────────────────────────────────────────────────────────────────────

// TIM-1140: category is now a per-plan editable row. The view exposes the
// joined name on the menu_items_with_cogs view as `category_name`.
export type MenuItemRow = {
  id: string
  plan_id: string
  position: number
  name: string
  category_id: string
  category_name: string | null
  price_cents: number
  cogs_cents: number
  expected_popularity: "low" | "medium" | "high" | null
  prep_time_seconds: number | null
  notes: string | null
  archived: boolean
}

export type MenuCardContent = {
  items: MenuItemRow[]
}

// ── constants ────────────────────────────────────────────────────────────────

// TIM-1140: categories are per-plan now; the PDF groups by the joined name
// returned on `category_name` and falls back to "Other" for unset rows.
const UNCATEGORIZED_LABEL = "Other"

// ── helpers ──────────────────────────────────────────────────────────────────

// TIM-2486: route money formatting through the central currency utility so
// non-USD plans render with the correct symbol/locale on the printed menu.
function fmtPrice(cents: number, currencyCode: string): string {
  return formatMinorUnits(cents, currencyCode)
}


function fmtDateLong(d: Date): string {
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  })
}

function fmtYyyymmdd(d: Date): string {
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("")
}

function slugify(s: string | null | undefined): string {
  if (!s) return "untitled"
  const slug = s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
  return slug || "untitled"
}

function computeMarginPct(price_cents: number, cogs_cents: number): number | null {
  if (price_cents <= 0) return null
  return ((price_cents - cogs_cents) / price_cents) * 100
}

function fmtPopularity(val: "low" | "medium" | "high" | null): string {
  if (!val) return "—"
  return val.charAt(0).toUpperCase() + val.slice(1)
}

function groupByCategory(items: MenuItemRow[]): Map<string, MenuItemRow[]> {
  const map = new Map<string, MenuItemRow[]>()
  for (const item of items) {
    const cat = item.category_name ?? UNCATEGORIZED_LABEL
    const bucket = map.get(cat) ?? []
    bucket.push(item)
    map.set(cat, bucket)
  }
  return map
}

// ── styles ───────────────────────────────────────────────────────────────────

function makeStyles(brand: BrandTokens) {
  return StyleSheet.create({
    page: {
      fontFamily: brand.fonts.sans,
      fontSize: 10,
      color: brand.colors.ink,
      backgroundColor: brand.colors.paper,
      paddingTop: brand.page.margin,
      paddingBottom: brand.page.margin + 20,
      paddingLeft: brand.page.margin,
      paddingRight: brand.page.margin,
    },
    emptyNote: {
      fontSize: 10,
      fontStyle: "italic",
      color: brand.colors.muted,
      padding: 8,
      backgroundColor: "var(--neutral-cool-f5)",
      borderRadius: 4,
      marginBottom: 8,
    },
    categoryLabel: {
      fontSize: 9,
      fontWeight: 700,
      color: brand.colors.muted,
      textTransform: "uppercase",
      letterSpacing: 1,
      marginTop: 8,
      marginBottom: 4,
      paddingBottom: 3,
      borderBottomWidth: 1,
      borderBottomColor: brand.colors.rule,
    },
    publicRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      paddingVertical: 5,
      borderBottomWidth: 1,
      borderBottomColor: brand.colors.rule,
    },
    publicName: {
      fontSize: 10,
      color: brand.colors.ink,
      flex: 1,
    },
    publicPrice: {
      fontSize: 10,
      fontWeight: 700,
      color: brand.colors.ink,
      textAlign: "right",
      width: 60,
    },
    footerNote: {
      fontSize: 8,
      color: brand.colors.muted,
      marginTop: 12,
      fontStyle: "italic",
    },
  })
}

// ── Page 1: public menu ──────────────────────────────────────────────────────

function PublicMenuPage({
  items,
  shopName,
  generatedDate,
  brand,
  currencyCode,
}: {
  items: MenuItemRow[]
  shopName: string | null
  generatedDate: string
  brand: BrandTokens
  currencyCode: string
}) {
  const styles = makeStyles(brand)
  const active = items.filter((i) => !i.archived && i.price_cents > 0)
  const grouped = groupByCategory(active)

  return (
    <Page size={brand.page.size} style={styles.page}>
      <PdfHeader shopName={shopName} workspaceName="Menu" brand={brand} />

      {active.length === 0 ? (
        <PdfSection title="Menu" brand={brand}>
          <Text style={styles.emptyNote}>
            No priced menu items found. Add items in the Menu &amp; Pricing workspace.
          </Text>
        </PdfSection>
      ) : (
        <>
          {Array.from(grouped.entries()).map(([cat, catItems]) => {
            if (catItems.length === 0) return null
            return (
              <View key={cat}>
                <Text style={styles.categoryLabel}>{cat}</Text>
                {catItems.map((item) => (
                  <View key={item.id} style={styles.publicRow}>
                    <Text style={styles.publicName}>{item.name}</Text>
                    <Text style={styles.publicPrice}>{fmtPrice(item.price_cents, currencyCode)}</Text>
                  </View>
                ))}
              </View>
            )
          })}
          <Text style={styles.footerNote}>
            Prices as of {generatedDate}. Subject to change.
          </Text>
        </>
      )}

      <PdfFooter generatedDate={generatedDate} brand={brand} />
    </Page>
  )
}

// ── Page 2: operator cost analysis ───────────────────────────────────────────

function OperatorPage({
  items,
  shopName,
  generatedDate,
  brand,
  currencyCode,
}: {
  items: MenuItemRow[]
  shopName: string | null
  generatedDate: string
  brand: BrandTokens
  currencyCode: string
}) {
  const styles = makeStyles(brand)
  const active = items.filter((i) => !i.archived)

  const columns: ColumnDef[] = [
    { key: "category", label: "Category", width: 65 },
    { key: "name", label: "Item" },
    { key: "price", label: "Price", currency: true, width: 55 },
    { key: "cogs", label: "COGS", currency: true, width: 55 },
    { key: "margin_pct", label: "Margin%", width: 55 },
    { key: "popularity", label: "Popularity", width: 60 },
  ]

  const rows: Row[] = active.map((item) => {
    const margin = computeMarginPct(item.price_cents, item.cogs_cents)
    return {
      category: item.category_name ?? UNCATEGORIZED_LABEL,
      name: item.name,
      price: item.price_cents,
      cogs: item.cogs_cents,
      margin_pct: margin !== null ? `${margin.toFixed(1)}%` : "—",
      popularity: fmtPopularity(item.expected_popularity),
    }
  })

  const totalsRow: Row | undefined =
    active.length > 0
      ? {
          category: "",
          name: `${active.length} items`,
          price: "",
          cogs: "",
          margin_pct: "",
          popularity: "",
        }
      : undefined

  return (
    <Page size={brand.page.size} style={styles.page}>
      <PdfHeader shopName={shopName} workspaceName="Menu — Cost analysis" brand={brand} />

      {active.length === 0 ? (
        <PdfSection title="Cost analysis" brand={brand}>
          <Text style={styles.emptyNote}>
            No menu items found. Add items in the Menu &amp; Pricing workspace.
          </Text>
        </PdfSection>
      ) : (
        <PdfSection title="Item-level cost &amp; margin" brand={brand}>
          <PdfTable columns={columns} rows={rows} totalsRow={totalsRow} currencyCode={currencyCode} />
          <Text style={styles.footerNote}>
            Margin% = (price − COGS) / price. Popularity set per item in the Menu workspace.
          </Text>
        </PdfSection>
      )}

      <PdfFooter generatedDate={generatedDate} brand={brand} />
    </Page>
  )
}

// ── top-level document ────────────────────────────────────────────────────────

function MenuCardPdf({
  content,
  shopName,
  generatedDate,
  brand,
  currencyCode,
}: {
  content: MenuCardContent
  shopName: string | null
  generatedDate: string
  brand: BrandTokens
  currencyCode: string
}) {
  const { items } = content
  return (
    <PdfDocument shopName={shopName}>
      <PublicMenuPage items={items} shopName={shopName} generatedDate={generatedDate} brand={brand} currencyCode={currencyCode} />
      <OperatorPage items={items} shopName={shopName} generatedDate={generatedDate} brand={brand} currencyCode={currencyCode} />
    </PdfDocument>
  )
}

// ── template export ───────────────────────────────────────────────────────────

export const menuCardTemplate: PdfTemplate<MenuCardContent> = {
  workspace_key: "menu_pricing",

  dataLoader: async (planId, _userId, supabase) => {
    // TIM-1140: select from the view so we get the joined category_name.
    const { data: items, error } = await supabase
      .from("menu_items_with_cogs")
      .select("*")
      .eq("plan_id", planId)
      .eq("archived", false)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true })

    if (error) throw new Error(`menu_items fetch failed: ${error.message}`)
    return { items: items ?? [] }
  },

  render: (ctx) => {
    const generatedDate = fmtDateLong(new Date())
    return (
      <MenuCardPdf
        content={ctx.content}
        shopName={ctx.plan.shop_name}
        generatedDate={generatedDate}
        brand={ctx.brand}
        currencyCode={ctx.currencyCode}
      />
    )
  },

  filename: (ctx) => {
    const slug = slugify(ctx.plan.shop_name)
    const date = fmtYyyymmdd(new Date())
    return `menu-card-${slug}-${date}.pdf`
  },
}
