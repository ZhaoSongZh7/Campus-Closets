"use client"

import { Clock, Droplet, Shield, Undo2 } from "lucide-react"

import { InfoRow, PageTitle, Panel, PanelHeader } from "@/components/kit"
import { AppShell } from "@/components/site/shell"
import { PLATFORM_FEE_RATE } from "@/lib/format"

const faqs = [
  { q: "How do try-ons work?", a: "Request a day, time and place from any listing that offers try-ons. They take about 20 minutes, are free, and carry no commitment to rent." },
  { q: "When am I charged?", a: "Only after the lender accepts your reservation. A refundable deposit hold is placed at the same time and released after the return check." },
  { q: "How do lenders get paid?", a: `Earnings become available once a rental is returned and checked. The platform keeps ${Math.round(PLATFORM_FEE_RATE * 100)}% of each completed rental.` },
  { q: "What if something goes wrong?", a: "Use “Report an issue” on the rental page. Condition photos from pickup and return are shared with both sides." },
]

export default function HelpPage() {
  return (
    <AppShell className="max-w-[960px] xl:px-8">
      <PageTitle title="Help" description="How renting and lending work, and the policies every rental follows." />
      <Panel id="policy" className="scroll-mt-20">
        <PanelHeader title="Cleaning & damage policy" description="These defaults apply unless a listing says otherwise." />
        <div className="grid gap-5 md:grid-cols-2">
          <InfoRow icon={Droplet} title="Cleaning" text="Each listing states who cleans. If the lender cleans, a fixed cleaning fee is added to the renter's total." />
          <InfoRow icon={Shield} title="Damage & deposit" text="The deposit hold covers repairs for damage beyond normal wear, judged against the pickup photos." />
          <InfoRow icon={Clock} title="Late returns" text="Returning late is charged at the daily rate for each extra day started. Message the lender as early as you can." />
          <InfoRow icon={Undo2} title="Cancellation" text="Free cancellation up to 48 hours before pickup. Try-ons can be cancelled up to 2 hours before." />
        </div>
      </Panel>
      <Panel>
        <PanelHeader title="Common questions" />
        <dl className="flex flex-col gap-5">
          {faqs.map((f) => (
            <div key={f.q} className="flex flex-col gap-1">
              <dt className="text-sm font-semibold">{f.q}</dt>
              <dd className="text-sm leading-normal text-muted-foreground">{f.a}</dd>
            </div>
          ))}
        </dl>
      </Panel>
    </AppShell>
  )
}
