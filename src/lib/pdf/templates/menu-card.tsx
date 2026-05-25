// TIM-708: menu_card_with_cost_analysis PDF template.
// Page 1 — public menu (items + prices grouped by category, customer-facing).
// Page 2 — operator view (price + cogs + margin% + mix + margin contribution per 100 covers).
// Data is row-based (menu_items table), so we use the dataLoader hook.

import React from "react"
import { Page, View, Text, StyleSheet } from "@react-pdf/renderer"
import { BRAND } from "../brand"
import { PdfDocument } from "../components/PdfDocument"
import { PdfHeader } from "../components/PdfHeader"
import { PdfFooter } from "../components/PdfFooter"
import { PdfSection } from "../components/PdfSection"
import { PdfTable, type ColumnDef, type Row } from "../components/PdfTable"
import type { PdfTemplate } from "../registry"

// ── types ────────────────────────────────────────────────────────────────────

type MenuItemCategory =
  | "espresso"
  | "drip"
  | "specialty"
  | "food"
  | "retail"
  | "other"

export type MenuItemRow = {
  id: string
  plan_id: string
  position: number
  name: string
  category: MenuItemCategory
  price_cents: number
  cogs_cents: number
  expected_mix_pct: number
  prep_time_seconds: number | null
  notes: string | null
  archived: boolean
}

export type MenuCardContent = {
  items: MenuItemRow[]
}

// ── constants ────────────────────────────────────────────────────────────────

const CATEGORY_LABEL: Record<MenuItemCategory, string> = {
  espresso: "Espresso",
  drip: "Drip Coffee",
  specialty: "Specialty",
  food: "Food",
  retail: "Retail",
  other: "Other",
}

const CATEGORY_ORDER: MenuItemCategory[] = [
  "espresso",
  "drip",
  "specialty",
  "food",
  "retail",
  "other",
]

// ── helpers ──────────────────────────────────────────────────────────────────

function fmtPrice(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100)
}

function fmtPct(val: number): string {
  return `${val.toFixed(1)}%`
}

function fmtDollar(val: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(val)
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

// Mirrors computeFooter from MenuItemsTable.tsx exactly so numbers match.
function computeFooter(items: MenuItemRow[]) {
  const active = items.filter((i) => !i.archived)
  if (active.length === 0) return null

  const totalMix = active.reduce((s, i) => s + i.expected_mix_pct, 0)

  const pricedWithMix = active.filter(
    (i) => i.price_cents > 0 && i.expected_mix_pct > 0
  )
  let weightedMargin: number | null = null
  if (pricedWithMix.length > 0) {
    const sumMix = pricedWithMix.reduce((s, i) => s + i.expected_mix_pct, 0)
    const sumWeighted = pricedWithMix.reduce(
      (s, i) => s + i.expected_mix_pct * computeMarginPct(i.price_cents, i.cogs_cents)!,
      0
    )
    weightedMargin = sumMix > 0 ? sumWeighted / sumMix : null
  }

  let marginPer100: number | null = null
  if (totalMix > 0) {
    const sumContrib = active.reduce(
      (s, i) => s + i.expected_mix_pct * (i.price_cents - i.cogs_cents),
      0
    )
    marginPer100 = sumContrib / totalMix
  }

  return { count: active.length, weightedMargin, marginPer100, totalMix }
}

function itemContribPer100(item: MenuItemRow, totalMix: number): number | null {
  if (totalMix <= 0) return null
  return (item.expected_mix_pct * (item.price_cents - item.cogs_cents)) / totalMix
}

function groupByCategory(items: MenuItemRow[]): Map<MenuItemCategory, MenuItemRow[]> {
  const map = new Map<MenuItemCategory, MenuItemRow[]>()
  for (const cat of CATEGORY_ORDER) map.set(cat, [])
  for (const item of items) {
    const bucket = map.get(item.category) ?? []
    bucket.push(item)
    map.set(item.category, bucket)
  }
  return map
}

// ── styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  page: {
    fontFamily: BRAND.fonts.sans,
    fontSize: 10,
    color: BRAND.colors.ink,
    backgroundColor: BRAND.colors.paper,
    paddingTop: BRAND.page.margin,
    paddingBottom: BRAND.page.margin + 20,
    paddingLeft: BRAND.page.margin,
    paddingRight: BRAND.page.margin,
  },
  emptyNote: {
    fontSize: 10,
    fontStyle: "italic",
    color: BRAND.colors.muted,
    padding: 8,
    backgroundColor: "#F5F6F5",
    borderRadius: 4,
    marginBottom: 8,
  },
  categoryLabel: {
    fontSize: 9,
    fontWeight: 700,
    color: BRAND.colors.muted,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginTop: 8,
    marginBottom: 4,
    paddingBottom: 3,
    borderBottomWidth: 1,
    borderBottomColor: BRAND.colors.rule,
  },
  publicRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: BRAND.colors.rule,
  },
  publicName: {
    fontSize: 10,
    color: BRAND.colors.ink,
    flex: 1,
  },
  publicPrice: {
    fontSize: 10,
    fontWeight: 700,
    color: BRAND.colors.ink,
    textAlign: "right",
    width: 60,
  },
  footerNote: {
    fontSize: 8,
    color: BRAND.colors.muted,
    marginTop: 12,
    fontStyle: "italic",
  },
  summaryRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 10,
  },
  summaryCard: {
    flex: 1,
    minWidth: 120,
    borderWidth: 1,
    borderColor: BRAND.colors.rule,
    padding: 8,
    borderRadius: 4,
  },
  summaryLabel: {
    fontSize: 8,
    color: BRAND.colors.muted,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 4,
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: 700,
    color: BRAND.colors.ink,
  },
})

// ── Page 1: public menu ──────────────────────────────────────────────────────

function PublicMenuPage({
  items,
  shopName,
  generatedDate,
}: {
  items: MenuItemRow[]
  shopName: string | null
  generatedDate: string
}) {
  const active = items.filter((i) => !i.archived && i.price_cents > 0)
  const grouped = groupByCategory(active)

  return (
    <Page size={BRAND.page.size} style={styles.page}>
      <PdfHeader shopName={shopName} workspaceName="Menu" />

      {active.length === 0 ? (
        <PdfSection title="Menu">
          <Text style={styles.emptyNote}>
            No priced menu items found. Add items in the Menu &amp; Pricing workspace.
          </Text>
        </PdfSection>
      ) : (
        <>
          {CATEGORY_ORDER.map((cat) => {
            const catItems = grouped.get(cat) ?? []
            if (catItems.length === 0) return null
            return (
              <View key={cat}>
                <Text style={styles.categoryLabel}>{CATEGORY_LABEL[cat]}</Text>
                {catItems.map((item) => (
                  <View key={item.id} style={styles.publicRow}>
                    <Text style={styles.publicName}>{item.name}</Text>
                    <Text style={styles.publicPrice}>{fmtPrice(item.price_cents)}</Text>
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

      <PdfFooter generatedDate={generatedDate} />
    </Page>
  )
}

// ── Page 2: operator cost analysis ───────────────────────────────────────────

function OperatorPage({
  items,
  shopName,
  generatedDate,
}: {
  items: MenuItemRow[]
  shopName: string | null
  generatedDate: string
}) {
  const active = items.filter((i) => !i.archived)
  const footer = computeFooter(items)
  const totalMix = footer?.totalMix ?? 0

  const columns: ColumnDef[] = [
    { key: "category", label: "Category", width: 65 },
    { key: "name", label: "Item" },
    { key: "price", label: "Price", currency: true, width: 55 },
    { key: "cogs", label: "COGS", currency: true, width: 55 },
    { key: "margin_pct", label: "Margin%", width: 55 },
    { key: "mix_pct", label: "Mix%", width: 40 },
    { key: "contrib", label: "$/100 covers", width: 70 },
  ]

  const rows: Row[] = active.map((item) => {
    const margin = computeMarginPct(item.price_cents, item.cogs_cents)
    const contrib = itemContribPer100(item, totalMix)
    return {
      category: CATEGORY_LABEL[item.category],
      name: item.name,
      price: item.price_cents,
      cogs: item.cogs_cents,
      margin_pct: margin !== null ? `${margin.toFixed(1)}%` : "—",
      mix_pct: `${item.expected_mix_pct.toFixed(1)}%`,
      contrib: contrib !== null ? fmtDollar(contrib) : "—",
    }
  })

  let totalsRow: Row | undefined
  if (footer) {
    totalsRow = {
      category: "",
      name: `${footer.count} items`,
      price: "",
      cogs: "",
      margin_pct:
        footer.weightedMargin !== null
          ? `${fmtPct(footer.weightedMargin)} wtd`
          : "—",
      mix_pct:
        footer.totalMix > 0
          ? `${footer.totalMix.toFixed(0)}%`
          : "—",
      contrib:
        footer.marginPer100 !== null
          ? fmtDollar(footer.marginPer100)
          : "—",
    }
  }

  return (
    <Page size={BRAND.page.size} style={styles.page}>
      <PdfHeader shopName={shopName} workspaceName="Menu — Cost analysis" />

      {footer && (
        <View style={styles.summaryRow}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Weighted margin</Text>
            <Text style={styles.summaryValue}>
              {footer.weightedMargin !== null ? fmtPct(footer.weightedMargin) : "—"}
            </Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Margin / 100 covers</Text>
            <Text style={styles.summaryValue}>
              {footer.marginPer100 !== null ? fmtDollar(footer.marginPer100) : "—"}
            </Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Items</Text>
            <Text style={styles.summaryValue}>{footer.count}</Text>
          </View>
        </View>
      )}

      {active.length === 0 ? (
        <PdfSection title="Cost analysis">
          <Text style={styles.emptyNote}>
            No menu items found. Add items in the Menu &amp; Pricing workspace.
          </Text>
        </PdfSection>
      ) : (
        <PdfSection title="Item-level cost &amp; margin">
          <PdfTable columns={columns} rows={rows} totalsRow={totalsRow} />
          <Text style={styles.footerNote}>
            $/100 covers = margin dollars generated per 100 customers at the given mix.{"\n"}
            Weighted margin = mix-weighted average margin across all priced items.
          </Text>
        </PdfSection>
      )}

      <PdfFooter generatedDate={generatedDate} />
    </Page>
  )
}

// ── top-level document ────────────────────────────────────────────────────────

function MenuCardPdf({
  content,
  shopName,
  generatedDate,
}: {
  content: MenuCardContent
  shopName: string | null
  generatedDate: string
}) {
  const { items } = content
  return (
    <PdfDocument>
      <PublicMenuPage items={items} shopName={shopName} generatedDate={generatedDate} />
      <OperatorPage items={items} shopName={shopName} generatedDate={generatedDate} />
    </PdfDocument>
  )
}

// ── template export ───────────────────────────────────────────────────────────

export const menuCardTemplate: PdfTemplate<MenuCardContent> = {
  workspace_key: "menu_pricing",

  dataLoader: async (planId, _userId, supabase) => {
    const { data: items, error } = await supabase
      .from("menu_items")
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
      />
    )
  },

  filename: (ctx) => {
    const slug = slugify(ctx.plan.shop_name)
    const date = fmtYyyymmdd(new Date())
    return `groundwork-menu-card-${slug}-${date}.pdf`
  },
}
