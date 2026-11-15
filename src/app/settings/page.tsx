"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Bell, CreditCard, DollarSign, MapPin, Shield, Shirt, Upload, User } from "lucide-react"
import { toast } from "sonner"

import { useAccount } from "@/components/app-provider"
import { ChipGroup, Field, FieldGroup, IconTile, PageTitle, Panel, PanelHeader, PersonAvatar, SimpleSelect } from "@/components/kit"
import { PlaceField } from "@/components/place-field"
import { AppShell } from "@/components/site/shell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { fileToDataUrl, initialsOf, SIZES, STYLES } from "@/lib/format"
import { actions } from "@/lib/store"
import type { Account } from "@/lib/types"

const NAV = [
  { id: "account", label: "Account", icon: User },
  { id: "sizes", label: "Sizes & style", icon: Shirt },
  { id: "location", label: "Location", icon: MapPin },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "payments", label: "Payments & payouts", icon: CreditCard },
  { id: "privacy", label: "Privacy & safety", icon: Shield },
]
const NOTIFICATIONS: { key: keyof Account["notifications"]; title: string; text: string }[] = [
  { key: "requests", title: "Requests and bookings", text: "Try-on and reservation requests, acceptances, and changes." },
  { key: "reminders", title: "Pickup and return reminders", text: "Reminders the day before and two hours before a handoff." },
  { key: "messages", title: "Messages", text: "New messages from renters and lenders." },
  { key: "tips", title: "Tips and product updates", text: "Occasional emails about new features and lending tips." },
]

function SwitchRow({ title, text, checked, onChange }: { title: string; text: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-4">
      <span className="flex flex-1 flex-col gap-1">
        <span className="text-sm font-medium">{title}</span>
        <span className="text-[13px] text-muted-foreground">{text}</span>
      </span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  )
}

function Settings() {
  const account = useAccount()
  const router = useRouter()
  const fileInput = useRef<HTMLInputElement>(null)
  const initial = { firstName: account.firstName, lastName: account.lastName, email: account.email, phone: account.phone, bio: account.bio }
  const [profile, setProfile] = useState(initial)
  const [zip, setZip] = useState(account.zip)
  const [dialog, setDialog] = useState<"card" | "bank" | "deactivate" | null>(null)
  const [number, setNumber] = useState("")
  const dirty = JSON.stringify(profile) !== JSON.stringify(initial)
  const update = (key: keyof typeof profile) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setProfile((p) => ({ ...p, [key]: e.target.value }))
  const close = () => {
    setDialog(null)
    setNumber("")
  }

  return (
    <>
      <PageTitle title="Settings" description="Manage your account, location, notifications, and payments." />
      <div className="grid items-start gap-8 lg:grid-cols-[220px_minmax(0,1fr)]">
        <nav aria-label="Settings sections" className="flex gap-1 overflow-x-auto lg:sticky lg:top-24 lg:flex-col">
          {NAV.map(({ id, label, icon: Icon }) => (
            <a key={id} href={`#${id}`} className="flex h-9 shrink-0 items-center gap-2.5 rounded-lg px-3 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground">
              <Icon className="size-4" />
              {label}
            </a>
          ))}
        </nav>

        <div className="flex min-w-0 flex-col gap-6">
          <Panel id="account" className="scroll-mt-24">
            <PanelHeader title="Profile" description="This is shown on your public profile." />
            <div className="flex items-center gap-4">
              <PersonAvatar initials={initialsOf(`${account.firstName} ${account.lastName}`)} src={account.avatar} className="size-16 text-lg" />
              <div className="flex flex-col gap-2">
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => fileInput.current?.click()}>
                    <Upload /> Upload photo
                  </Button>
                  <Button variant="ghost" disabled={!account.avatar} onClick={() => actions.updateAccount({ avatar: undefined })}>Remove</Button>
                </div>
                <p className="text-xs text-muted-foreground">JPG or PNG, up to 5 MB</p>
              </div>
              <input
                ref={fileInput}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0]
                  e.target.value = ""
                  if (!file) return
                  try {
                    actions.updateAccount({ avatar: await fileToDataUrl(file, 256) })
                    toast.success("Profile photo updated")
                  } catch {
                    toast.error("That file couldn't be read as an image.")
                  }
                }}
              />
            </div>
            <form
              className="flex flex-col gap-5"
              onSubmit={(e) => {
                e.preventDefault()
                actions.updateAccount({ ...profile, firstName: profile.firstName.trim(), lastName: profile.lastName.trim(), email: profile.email.trim() })
                toast.success("Profile saved")
              }}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="First name">
                  <Input required value={profile.firstName} onChange={update("firstName")} placeholder="First name" />
                </Field>
                <Field label="Last name">
                  <Input required value={profile.lastName} onChange={update("lastName")} placeholder="Last name" />
                </Field>
                <Field label="Email">
                  <Input required type="email" value={profile.email} onChange={update("email")} placeholder="name@example.com" />
                </Field>
                <Field label="Phone">
                  <Input type="tel" value={profile.phone} onChange={update("phone")} placeholder="(000) 000-0000" />
                </Field>
              </div>
              <Field label="Bio">
                <Textarea value={profile.bio} onChange={update("bio")} placeholder="A sentence or two about your style and what’s in your closet." className="min-h-20" maxLength={280} />
              </Field>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" disabled={!dirty} onClick={() => setProfile(initial)}>Cancel</Button>
                <Button type="submit" disabled={!dirty}>Save changes</Button>
              </div>
            </form>
          </Panel>

          <Panel id="sizes" className="scroll-mt-24">
            <PanelHeader title="Sizes & style" description="Used to show outfits that fit you first." />
            <FieldGroup label="Dress size">
              <ChipGroup options={SIZES} value={account.sizes.dress} onChange={(dress) => actions.updateAccount({ sizes: { ...account.sizes, dress } })} />
            </FieldGroup>
            <FieldGroup label="Tops & jackets">
              <ChipGroup options={SIZES} value={account.sizes.tops} onChange={(tops) => actions.updateAccount({ sizes: { ...account.sizes, tops } })} />
            </FieldGroup>
            <FieldGroup label="Styles you like">
              <ChipGroup options={STYLES} value={account.styles} onChange={(styles) => actions.updateAccount({ styles })} />
            </FieldGroup>
          </Panel>

          <Panel id="location" className="scroll-mt-24">
            <PanelHeader title="Location" description="Used to show outfits and renters near you." />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Neighborhood or ZIP" hint={account.zip && !account.geo ? "We can’t tell where that is, so distances won’t show. Use a ZIP code or “City, ST”." : undefined}>
                <PlaceField
                  value={zip}
                  onChange={setZip}
                  onPlace={(place) => actions.updateAccount({ zip: place.label })}
                  onBlur={() => zip.trim() !== account.zip && actions.updateAccount({ zip: zip.trim() })}
                  placeholder="ZIP code or City, ST"
                />
              </Field>
              <Field label="Search radius">
                <SimpleSelect
                  value={String(account.radius)}
                  onChange={(v) => v && actions.updateAccount({ radius: Number(v) })}
                  options={["1", "2", "5", "10", "25"].map((v) => ({ value: v, label: `Within ${v} mile${v === "1" ? "" : "s"}` }))}
                />
              </Field>
            </div>
            <SwitchRow title="Show approximate location only" text="Your exact address is shared only after you accept a booking." checked={account.approxLocation} onChange={(approxLocation) => actions.updateAccount({ approxLocation })} />
          </Panel>

          <Panel id="notifications" className="scroll-mt-24">
            <PanelHeader title="Notifications" />
            {NOTIFICATIONS.map((n, i) => (
              <div key={n.key} className="flex flex-col gap-5">
                {i > 0 && <Separator />}
                <SwitchRow title={n.title} text={n.text} checked={account.notifications[n.key]} onChange={(v) => actions.updateAccount({ notifications: { ...account.notifications, [n.key]: v } })} />
              </div>
            ))}
          </Panel>

          <Panel id="payments" className="scroll-mt-24">
            <PanelHeader title="Payments & payouts" />
            <div className="flex items-center gap-3 rounded-[10px] border p-4">
              <IconTile icon={CreditCard} />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <p className="text-sm font-semibold">{account.card ? `Card •••• ${account.card.last4}` : "No card saved"}</p>
                <p className="text-[13px] text-muted-foreground">Used for rentals and deposit holds</p>
              </div>
              {account.card && <Badge variant="secondary">Default</Badge>}
              <Button variant="outline" size="sm" onClick={() => setDialog("card")}>{account.card ? "Edit" : "Add"}</Button>
            </div>
            <div className="flex items-center gap-3 rounded-[10px] border p-4">
              <IconTile icon={DollarSign} />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <p className="text-sm font-semibold">{account.bankLast4 ? `Bank account •••• ${account.bankLast4}` : "No bank account saved"}</p>
                <p className="text-[13px] text-muted-foreground">Used for lender payouts</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => setDialog("bank")}>{account.bankLast4 ? "Edit" : "Add"}</Button>
            </div>
          </Panel>

          <Panel id="privacy" className="scroll-mt-24">
            <PanelHeader title="Your data" description="Your profile, listings, rentals, requests and messages are saved to your Campus Closets account, so they follow you to any device. Other members see your first name and last initial, never your email or phone." />
            <p className="text-[13px] text-muted-foreground">Messages and pickup or return photos are only visible to you and the other person in that rental.</p>
          </Panel>

          <Panel>
            <PanelHeader title="Deactivate account" description="Permanently deletes your account and your listings. Active rentals should be completed first." />
            <Button variant="destructive" className="w-fit" onClick={() => setDialog("deactivate")}>Deactivate account</Button>
          </Panel>
        </div>
      </div>

      <Dialog open={dialog === "card" || dialog === "bank"} onOpenChange={(o) => !o && close()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialog === "card" ? "Payment card" : "Payout bank account"}</DialogTitle>
            <DialogDescription>Demo only: nothing is charged or connected. Only the last four digits are kept.</DialogDescription>
          </DialogHeader>
          <Field label={dialog === "card" ? "Card number" : "Bank account number"}>
            <Input value={number} onChange={(e) => setNumber(e.target.value.replace(/[^\d ]/g, ""))} inputMode="numeric" placeholder={dialog === "card" ? "1234 1234 1234 1234" : "Account number"} />
          </Field>
          <DialogFooter>
            <Button variant="outline" onClick={close}>Cancel</Button>
            <Button
              disabled={number.replace(/\D/g, "").length < (dialog === "card" ? 13 : 6)}
              onClick={() => {
                const last4 = number.replace(/\D/g, "").slice(-4)
                actions.updateAccount(dialog === "card" ? { card: { last4 } } : { bankLast4: last4, payoutVerified: true })
                toast.success(dialog === "card" ? "Card saved" : "Payout account saved")
                close()
              }}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === "deactivate"} onOpenChange={(o) => !o && close()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Deactivate your account?</DialogTitle>
            <DialogDescription>Your account, your listings and their photos are deleted and you’ll be signed out. This can’t be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={close}>Keep account</Button>
            <Button
              variant="destructive"
              onClick={async () => {
                const result = await actions.deactivateAccount()
                if (!result.ok) return void toast.error(result.error)
                router.push("/")
              }}
            >
              Deactivate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

export default function SettingsPage() {
  return (
    <AppShell auth>
      <Settings />
    </AppShell>
  )
}
