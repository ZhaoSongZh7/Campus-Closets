"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Lock, MapPin } from "lucide-react"

import { AuthLayout } from "@/components/auth/auth-layout"
import { CheckItem, Field } from "@/components/kit"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { actions } from "@/lib/store"

export default function SignUpPage() {
  const router = useRouter()
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", password: "", zip: "" })
  const [agree, setAgree] = useState(false)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const update = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }))

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (form.password.length < 8) return setError("Use a password with at least 8 characters.")
    if (!agree) return setError("Please agree to the Terms and the Cleaning & Damage Policy to continue.")
    setBusy(true)
    setError("")
    const result = await actions.signUp({
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      email: form.email.trim(),
      zip: form.zip.trim(),
      password: form.password,
    })
    setBusy(false)
    if (!result.ok) return setError(result.error)
    router.push("/onboarding")
  }

  return (
    <AuthLayout title="Create your account" subtitle="Rent from closets nearby, or lend your own.">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="First name">
            <Input required value={form.firstName} onChange={update("firstName")} placeholder="First name" autoComplete="given-name" />
          </Field>
          <Field label="Last name">
            <Input required value={form.lastName} onChange={update("lastName")} placeholder="Last name" autoComplete="family-name" />
          </Field>
        </div>
        <Field label="Email">
          <Input required type="email" value={form.email} onChange={update("email")} placeholder="name@example.com" autoComplete="email" />
        </Field>
        <Field label="Password" hint="At least 8 characters.">
          <span className="relative">
            <Input required type="password" value={form.password} onChange={update("password")} placeholder="••••••••" autoComplete="new-password" className="pr-9" />
            <Lock className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground" />
          </span>
        </Field>
        <Field label="Neighborhood or ZIP">
          <span className="relative">
            <MapPin className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input required value={form.zip} onChange={update("zip")} placeholder="Used to show outfits near you" autoComplete="postal-code" className="pl-9" />
          </span>
        </Field>
        <CheckItem checked={agree} onChange={setAgree}>
          <span>
            I agree to the Terms and the{" "}
            <Link href="/help#policy" className="underline underline-offset-2">
              Cleaning &amp; Damage Policy
            </Link>
          </span>
        </CheckItem>
        {error && (
          <p role="alert" className="text-[13px] text-destructive">
            {error}
          </p>
        )}
        <Button type="submit" disabled={busy} className="h-10 w-full">
          {busy ? "Creating account…" : "Create account"}
        </Button>
        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-foreground hover:underline">
            Log in
          </Link>
        </p>
      </form>
    </AuthLayout>
  )
}
