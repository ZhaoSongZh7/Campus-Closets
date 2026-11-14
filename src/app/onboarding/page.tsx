"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { cn } from "cn"
import { ArrowRight, Check, MapPin, Shield, Upload } from "lucide-react"

import { Gate, useAccount } from "@/components/app-provider"
import { ChipGroup, Field, FieldGroup, LinkButton, Panel, SimpleSelect } from "@/components/kit"
import { MinimalHeader } from "@/components/site/navbar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { OCCASIONS, SIZES, STYLES } from "@/lib/format"
import { actions } from "@/lib/store"

const STEPS = ["Sizes & style", "Location", "Verify identity"]
const WAISTS = ["24", "26", "28", "30", "32", "34", "36", "38", "40"]
const SUITS = ["34S", "36S", "36R", "38S", "38R", "40R", "40L", "42R", "42L", "44R", "46R"]
const SHOES = ["5", "6", "7", "8", "9", "10", "11", "12", "13"]

function Steps({ current }: { current: number }) {
  return (
    <ol className="flex items-center gap-4">
      {STEPS.map((label, i) => (
        <li key={label} className="flex items-center gap-4">
          <span className="flex items-center gap-2">
            <span
              className={cn(
                "flex size-7 items-center justify-center rounded-full text-xs font-semibold",
                i <= current ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
              )}
            >
              {i < current ? <Check className="size-3.5" /> : i + 1}
            </span>
            <span className={cn("hidden text-sm font-medium sm:inline", i > current && "text-muted-foreground")}>{label}</span>
          </span>
          {i < STEPS.length - 1 && <span className="h-px w-8 bg-border sm:w-12" />}
        </li>
      ))}
    </ol>
  )
}

function Onboarding() {
  const router = useRouter()
  const account = useAccount()
  const [step, setStep] = useState(0)
  const [sizes, setSizes] = useState(account.sizes)
  const [styles, setStyles] = useState(account.styles)
  const [occasions, setOccasions] = useState(account.occasions)
  const [budget, setBudget] = useState(account.budget)
  const [zip, setZip] = useState(account.zip)
  const [radius, setRadius] = useState(String(account.radius))
  const [approx, setApprox] = useState(account.approxLocation)
  const [idFile, setIdFile] = useState("")

  const finish = (verified: boolean) => {
    actions.updateAccount({ onboarded: true, idVerified: verified || account.idVerified })
    router.push("/browse")
  }
  const next = () => {
    if (step === 0) actions.updateAccount({ sizes, styles, occasions, budget })
    if (step === 1) actions.updateAccount({ zip: zip.trim(), radius: Number(radius), approxLocation: approx })
    setStep(step + 1)
  }

  return (
    <div className="flex flex-1 flex-col items-center gap-8 bg-subtle px-4 py-10">
      <Steps current={step} />
      <Panel className="w-full max-w-[720px] gap-6 p-8">
        {step === 0 && (
          <>
            <div className="flex flex-col gap-1.5">
              <h1 className="text-2xl font-semibold tracking-[-0.48px]">Tell us your sizes and style</h1>
              <p className="text-sm text-muted-foreground">We use this to show outfits that fit you first. You can change it any time.</p>
            </div>
            <FieldGroup label="Dress size">
              <ChipGroup options={SIZES} value={sizes.dress} onChange={(dress) => setSizes({ ...sizes, dress })} />
            </FieldGroup>
            <FieldGroup label="Tops & jackets">
              <ChipGroup options={SIZES} value={sizes.tops} onChange={(tops) => setSizes({ ...sizes, tops })} />
            </FieldGroup>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Waist">
                <SimpleSelect value={sizes.waist} onChange={(waist) => setSizes({ ...sizes, waist })} options={WAISTS} />
              </Field>
              <Field label="Suit size">
                <SimpleSelect value={sizes.suit} onChange={(suit) => setSizes({ ...sizes, suit })} options={SUITS} />
              </Field>
              <Field label="Shoe size">
                <SimpleSelect value={sizes.shoe} onChange={(shoe) => setSizes({ ...sizes, shoe })} options={SHOES} />
              </Field>
            </div>
            <Separator />
            <FieldGroup label="Styles you like">
              <ChipGroup options={STYLES} value={styles} onChange={setStyles} />
            </FieldGroup>
            <FieldGroup label="Occasions coming up">
              <ChipGroup options={OCCASIONS.slice(0, 5)} value={occasions} onChange={setOccasions} />
            </FieldGroup>
            <FieldGroup label="Typical budget per rental">
              <Slider min={10} max={200} step={5} value={[budget]} onValueChange={(v) => setBudget(Array.isArray(v) ? v[0]! : v)} aria-label="Budget per day" />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>$10</span>
                <span className="font-medium text-foreground">{budget >= 200 ? "$200+ / day" : `Up to $${budget} / day`}</span>
                <span>$200+</span>
              </div>
            </FieldGroup>
          </>
        )}
        {step === 1 && (
          <>
            <div className="flex flex-col gap-1.5">
              <h1 className="text-2xl font-semibold tracking-[-0.48px]">Where should we look?</h1>
              <p className="text-sm text-muted-foreground">Rentals happen in person, so we only show outfits and renters near you.</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Neighborhood or ZIP">
                <span className="relative">
                  <MapPin className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input value={zip} onChange={(e) => setZip(e.target.value)} placeholder="ZIP code" className="pl-9" />
                </span>
              </Field>
              <Field label="Search radius">
                <SimpleSelect value={radius} onChange={setRadius} options={["1", "2", "5", "10", "25"].map((v) => ({ value: v, label: `Within ${v} mile${v === "1" ? "" : "s"}` }))} />
              </Field>
            </div>
            <label className="flex items-center gap-4">
              <span className="flex flex-1 flex-col gap-1">
                <span className="text-sm font-medium">Show approximate location only</span>
                <span className="text-[13px] text-muted-foreground">Your exact address is shared only after you accept a booking.</span>
              </span>
              <Switch checked={approx} onCheckedChange={setApprox} />
            </label>
          </>
        )}
        {step === 2 && (
          <>
            <div className="flex flex-col gap-1.5">
              <h1 className="text-2xl font-semibold tracking-[-0.48px]">Verify your identity</h1>
              <p className="text-sm text-muted-foreground">Verified members get an “ID verified” badge, which lenders look for before accepting.</p>
            </div>
            <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed border-ring bg-subtle px-6 py-10 text-center hover:bg-muted">
              {idFile ? <Shield className="size-6" /> : <Upload className="size-6 text-muted-foreground" />}
              <span className="text-sm font-medium">{idFile || "Upload a photo of a government ID"}</span>
              <span className="text-xs text-muted-foreground">
                {idFile ? "Ready to submit." : "Driver's license, passport, or state ID. PNG or JPG."}
              </span>
              <input type="file" accept="image/*" className="hidden" onChange={(e) => setIdFile(e.target.files?.[0]?.name ?? "")} />
            </label>
            <p className="text-xs text-muted-foreground">
              In this MVP the file never leaves your browser and isn&apos;t stored — submitting simply marks your profile as verified.
            </p>
          </>
        )}
        <Separator />
        <div className="flex items-center justify-between">
          <Button variant="outline" disabled={step === 0} onClick={() => setStep(step - 1)}>
            Back
          </Button>
          {step < 2 ? (
            <Button onClick={next}>
              Continue <ArrowRight />
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => finish(false)}>
                Do this later
              </Button>
              <Button disabled={!idFile} onClick={() => finish(true)}>
                Submit and finish <ArrowRight />
              </Button>
            </div>
          )}
        </div>
      </Panel>
    </div>
  )
}

export default function OnboardingPage() {
  return (
    <>
      <MinimalHeader>
        <LinkButton href="/browse" variant="ghost">
          Skip for now
        </LinkButton>
      </MinimalHeader>
      <main className="flex flex-1 flex-col">
        <Gate auth>
          <Onboarding />
        </Gate>
      </main>
    </>
  )
}
