"use client"

import React from "react"
import { View, Text, StyleSheet } from "@react-pdf/renderer"
import { BRAND } from "../brand"

export type ColumnDef = {
  key: string
  label: string
  numeric?: boolean
  currency?: boolean
  width?: number | string
}

export type Row = Record<string, string | number | null | undefined>

const styles = StyleSheet.create({
  table: {
    borderWidth: 1,
    borderColor: BRAND.colors.rule,
    marginBottom: 8,
  },
  headerRow: {
    flexDirection: "row",
    backgroundColor: BRAND.colors.rule,
  },
  row: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: BRAND.colors.rule,
  },
  totalsRow: {
    flexDirection: "row",
    borderTopWidth: 2,
    borderTopColor: BRAND.colors.ink,
    backgroundColor: "#F5F6F5",
  },
  headerCell: {
    fontFamily: BRAND.fonts.sans,
    fontWeight: 700,
    fontSize: 9,
    color: BRAND.colors.ink,
    padding: 5,
    flex: 1,
  },
  cell: {
    fontFamily: BRAND.fonts.sans,
    fontSize: 9,
    color: BRAND.colors.ink,
    padding: 5,
    flex: 1,
  },
  cellRight: {
    textAlign: "right",
  },
  totalsCell: {
    fontFamily: BRAND.fonts.sans,
    fontWeight: 700,
    fontSize: 9,
    color: BRAND.colors.ink,
    padding: 5,
    flex: 1,
  },
})

function formatCents(value: number | string | null | undefined): string {
  if (value == null || value === "") return "—"
  const cents = typeof value === "string" ? parseFloat(value) : value
  if (isNaN(cents)) return "—"
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100)
}

function formatValue(col: ColumnDef, val: string | number | null | undefined): string {
  if (val == null || val === "") return "—"
  if (col.currency) return formatCents(val)
  if (col.numeric && typeof val === "number") {
    return val.toLocaleString("en-US")
  }
  return String(val)
}

type Props = {
  columns: ColumnDef[]
  rows: Row[]
  totalsRow?: Row
}

export function PdfTable({ columns, rows, totalsRow }: Props) {
  return (
    <View style={styles.table}>
      <View style={styles.headerRow}>
        {columns.map((col) => (
          <Text
            key={col.key}
            style={[
              styles.headerCell,
              col.numeric || col.currency ? styles.cellRight : {},
              col.width ? { flex: undefined, width: col.width } : {},
            ]}
          >
            {col.label}
          </Text>
        ))}
      </View>

      {rows.map((row, i) => (
        <View key={i} style={styles.row}>
          {columns.map((col) => (
            <Text
              key={col.key}
              style={[
                styles.cell,
                col.numeric || col.currency ? styles.cellRight : {},
                col.width ? { flex: undefined, width: col.width } : {},
              ]}
            >
              {formatValue(col, row[col.key])}
            </Text>
          ))}
        </View>
      ))}

      {totalsRow && (
        <View style={styles.totalsRow}>
          {columns.map((col) => (
            <Text
              key={col.key}
              style={[
                styles.totalsCell,
                col.numeric || col.currency ? styles.cellRight : {},
                col.width ? { flex: undefined, width: col.width } : {},
              ]}
            >
              {formatValue(col, totalsRow[col.key])}
            </Text>
          ))}
        </View>
      )}
    </View>
  )
}
