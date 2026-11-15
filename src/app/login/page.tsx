"use client"

import { Suspense, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Lock } from "lucide-react"
import { toast } from "sonner"

import { AuthLayout } from "@/components/auth/auth-layout"
import { CheckItem, Field } from "@/components/kit"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { actions } from "@/lib/store"

const GOOGLE_ERRORS: Record<string, string> = {
  google_setup: "Google sign-in isn’t set up on this site yet. Log in with your email for now.",
  google_cancelled: "Google sign-in was cancelled.",
  google_failed: "Google sign-in didn’t go through. Please try again.",
  google_unverified: "Google hasn’t verified that email address, so it can’t be used to sign in.",
}

function LoginForm() {
  const router = useRouter()
  const params = useSearchParams()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [remember, setRemember] = useState(true)
  const [error, setError] = useState(GOOGLE_ERRORS[params.get("error") ?? ""] ?? "")
  const [busy, setBusy] = useState(false)
  const connecting = params.get("google") === "link"

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError("")
    const result = await actions.logIn(email.trim(), password)
    setBusy(false)
    if (!result.ok) return setError(result.error)
    const next = params.get("next")
    router.push(next && next.startsWith("/") && !next.startsWith("//") ? next : "/browse")
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {connecting && (
        <p role="status" className="rounded-lg border bg-subtle px-3 py-2.5 text-[13px]">
          You already have an account with that email. Log in with your password once, and Google will be connected to it.
        </p>
      )}
      <Field label="Email">
        <Input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" autoComplete="email" />
      </Field>
      <Field label="Password">
        <span className="relative">
          <Input required type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoComplete="current-password" className="pr-9" />
          <Lock className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground" />
        </span>
      </Field>
      <div className="flex items-center justify-between">
        <CheckItem checked={remember} onChange={setRemember}>
          Remember me
        </CheckItem>
        <button
          type="button"
          className="text-sm font-medium hover:underline"
          onClick={() =>
            toast.info("Password reset needs an email service, which isn't connected yet.")
          }
        >
          Forgot password?
        </button>
      </div>
      {error && (
        <p role="alert" className="text-[13px] text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" disabled={busy} className="h-10 w-full">
        {busy ? "Logging in…" : "Log in"}
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        New here?{" "}
        <Link href="/signup" className="font-medium text-foreground hover:underline">
          Create an account
        </Link>
      </p>
    </form>
  )
}

export default function LoginPage() {
  return (
    <AuthLayout title="Welcome back" subtitle="Log in to manage your rentals and your closet.">
      <Suspense>
        <LoginForm />
      </Suspense>
    </AuthLayout>
  )
}
