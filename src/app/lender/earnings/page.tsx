"use client"

import { useState } from "react"
import { Clock, CreditCard, DollarSign, Search, TrendingUp, Upload, type LucideIcon } from "lucide-react"
import { toast } from "sonner"

import { useAccount, useApp } from "@/components/app-provider"
import { Field, IconTile, PageTitle, Panel, PanelHeader, SegTabs } from "@/components/kit"
import { EarningsChart, monthlyEarnings } from "@/components/lender-bits"
import { LenderShell } from "@/components/site/shell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { fmtShort, money, money2, PLATFORM_FEE_RATE } from "@/lib/format"
import { actions } from "@/lib/store"
import type { Transaction } from "@/lib/types"

const STATUS: Record<Transaction["status"], { label: string; variant: "warning" | "success" | "secondary" }> = {
  pending: { label: "Pending", variant: "warning" },
  available: { label: "Available", variant: "success" },
  paid: { label: "Paid out", variant: "secondary" },
}

function Stat({ label, icon: Icon, value, note }: { label: string; icon: LucideIcon; value: string; note: string }) {
  return (
    <Panel className="gap-2">
      <div className="flex items-center justify-between text-[13px] font-medium text-muted-foreground">
        {label}
        <Icon className="size-4" />
      </div>
      <p className="text-[28px] leading-tight font-semibold tracking-[-0.56px]">{value}</p>
      <p className="text-[13px] text-muted-foreground">{note}</p>
    </Panel>
  )
}

function exportCsv(rows: Transaction[]) {
  const esc = (v: string | number) => `"${String(v).replaceAll('"', '""')}"`
  const lines = [
    ["Date", "Item", "Renter", "Rental total", "Platform fee", "You earn", "Status"].map(esc).join(","),
    ...rows.map((t) => [t.date, t.listingTitle, t.renterName, t.total, t.fee, t.earn, STATUS[t.status].label].map(esc).join(",")),
  ]
  const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" }))
  const a = document.createElement("a")
  a.href = url
  a.download = "mutuari-earnings.csv"
  a.click()
  URL.revokeObjectURL(url)
}

function Earnings() {
  const s = useApp()
  const account = useAccount()
  const [months, setMonths] = useState<"6" | "12">("12")
  const [query, setQuery] = useState("")
  const [limit, setLimit] = useState(8)
  const [bankOpen, setBankOpen] = useState(false)
  const [bank, setBank] = useState("")

  const sum = (status: Transaction["status"]) => s.transactions.filter((t) => t.status === status).reduce((n, t) => n + t.earn, 0)
  const available = sum("available")
  const lifetime = sum("available") + sum("paid")
  const q = query.trim().toLowerCase()
  const rows = s.transactions.filter((t) => !q || `${t.listingTitle} ${t.renterName}`.toLowerCase().includes(q))
  const feePct = Math.round(PLATFORM_FEE_RATE * 100)

  return (
    <>
      <PageTitle title="Earnings" description="Payouts for completed rentals, after the platform fee.">
        <Button
          variant="outline"
          onClick={() => {
            exportCsv(rows)
            toast.success(`Exported ${rows.length} transactions`)
          }}
        >
          <Upload /> Export CSV
        </Button>
      </PageTitle>
      <div className="grid gap-4 md:grid-cols-3">
        <Stat label="Available to pay out" icon={DollarSign} value={money2(available)} note="From completed rentals" />
        <Stat label="Pending" icon={Clock} value={money2(sum("pending"))} note="Released after return checks" />
        <Stat label="Lifetime earnings" icon={TrendingUp} value={money(lifetime)} note={`Since joining in ${new Date(account.createdAt).getFullYear()}`} />
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Panel>
          <PanelHeader title="Earnings over time" description="After platform fee">
            <SegTabs value={months} onChange={setMonths} items={[{ value: "6", label: "6 months" }, { value: "12", label: "12 months" }]} />
          </PanelHeader>
          <EarningsChart data={monthlyEarnings(s.transactions, Number(months))} />
        </Panel>
        <Panel className="gap-4">
          <h2 className="text-base font-semibold">Payout method</h2>
          <div className="flex items-center gap-3 rounded-[10px] border bg-subtle p-4">
            <IconTile icon={CreditCard} className="bg-background" />
            <div className="flex min-w-0 flex-col gap-0.5">
              <p className="text-sm font-semibold">{account.bankLast4 ? `Bank account •••• ${account.bankLast4}` : "No payout account yet"}</p>
              <p className="text-[13px] text-muted-foreground">{account.bankLast4 ? "Payouts arrive in 1–3 business days" : "Add one to pay out your earnings"}</p>
            </div>
          </div>
          <Button
            className="h-10"
            disabled={!account.bankLast4 || available <= 0}
            onClick={() => {
              const amount = actions.payOut()
              toast.success(`${money2(amount)} is on its way to •••• ${account.bankLast4}`)
            }}
          >
            Pay out now
          </Button>
          <Button variant="outline" onClick={() => setBankOpen(true)}>
            {account.bankLast4 ? "Change payout method" : "Add payout method"}
          </Button>
          <Separator />
          <p className="text-sm font-semibold">How fees work</p>
          <p className="text-[13px] leading-normal text-muted-foreground">
            The platform takes {feePct}% of each completed rental’s daily-rate total. Cleaning fees and deposits aren’t included in the fee. Earnings move from pending to available after the return check.
          </p>
        </Panel>
      </div>

      <div className="overflow-hidden rounded-xl border bg-card shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
          <h2 className="text-base font-semibold">Transactions</h2>
          <span className="relative w-full sm:w-60">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search transactions" aria-label="Search transactions" className="pl-9" />
          </span>
        </div>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {["Date", "Item", "Rental total", "Platform fee", "You earn", "Status"].map((h) => (
                <TableHead key={h} className="h-10 px-6 text-[11px] font-semibold tracking-[0.66px] text-muted-foreground uppercase">{h}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.slice(0, limit).map((t) => (
              <TableRow key={t.id}>
                <TableCell className="px-6 py-3 text-[13px] text-muted-foreground">{fmtShort(t.date)}</TableCell>
                <TableCell className="px-6">
                  <p className="text-sm font-semibold">{t.listingTitle}</p>
                  <p className="text-[13px] text-muted-foreground">{t.renterName}</p>
                </TableCell>
                <TableCell className="px-6">{money(t.total)}</TableCell>
                <TableCell className="px-6 text-muted-foreground">– {money(t.fee)}</TableCell>
                <TableCell className="px-6 font-semibold">{money(t.earn)}</TableCell>
                <TableCell className="px-6"><Badge variant={STATUS[t.status].variant}>{STATUS[t.status].label}</Badge></TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="px-6 py-8 text-center text-sm text-muted-foreground">No transactions match that search.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        {rows.length > limit && (
          <div className="flex justify-center border-t p-3">
            <Button variant="ghost" onClick={() => setLimit(limit + 10)}>Show more ({rows.length - limit} remaining)</Button>
          </div>
        )}
      </div>

      <Dialog open={bankOpen} onOpenChange={setBankOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Payout method</DialogTitle>
            <DialogDescription>
              Demo only: no bank is connected. We keep just the last four digits so you can try the payout flow.
            </DialogDescription>
          </DialogHeader>
          <Field label="Bank account number">
            <Input value={bank} onChange={(e) => setBank(e.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder="Account number" />
          </Field>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBankOpen(false)}>Cancel</Button>
            <Button
              disabled={bank.length < 6}
              onClick={() => {
                actions.updateAccount({ bankLast4: bank.slice(-4), payoutVerified: true })
                setBank("")
                setBankOpen(false)
                toast.success("Payout method saved")
              }}
            >
              Save payout method
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

export default function EarningsPage() {
  return (
    <LenderShell>
      <Earnings />
    </LenderShell>
  )
}
