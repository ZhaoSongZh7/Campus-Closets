"use client"

import { createContext, useContext, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { Toaster } from "@/components/ui/sonner"
import { Button } from "@/components/ui/button"
import { actions, currentAccount, onStoreError, onStoreNotice, retryLoad, useAppSnapshot } from "@/lib/store"
import type { Account, State } from "@/lib/types"

type Loaded = { state: State | null; status: "loading" | "ready" | "error"; error: string }
const Ctx = createContext<Loaded>({ state: null, status: "loading", error: "" })

export function AppProvider({ children }: { children: React.ReactNode }) {
  const snapshot = useAppSnapshot()

  useEffect(() => {
    onStoreError((message) => toast.error(message))
    onStoreNotice((message) => toast.success(message))
    // Check for new requests, replies and notifications from other people.
    const timer = window.setInterval(() => void actions.poll(), 4000)
    return () => window.clearInterval(timer)
  }, [])

  return (
    <Ctx.Provider value={snapshot}>
      {children}
      <Toaster position="bottom-right" />
    </Ctx.Provider>
  )
}

/** State, or null until the first load from the server has finished. */
export const useMaybeApp = () => useContext(Ctx).state

/** State for components rendered inside <Gate>. */
export function useApp(): State {
  const s = useContext(Ctx).state
  if (!s) throw new Error("useApp must be used inside <Gate>")
  return s
}

/** The signed-in account for components rendered inside <Gate auth>. */
export function useAccount(): Account {
  const account = currentAccount(useApp())
  if (!account) throw new Error("useAccount must be used inside <Gate auth>")
  return account
}

export function Gate({ auth = false, children }: { auth?: boolean; children: React.ReactNode }) {
  const { state: s, status, error } = useContext(Ctx)
  const router = useRouter()
  const signedIn = s ? Boolean(currentAccount(s)) : false
  const blocked = Boolean(s) && auth && !signedIn

  const wasSignedIn = useRef(false)

  useEffect(() => {
    if (signedIn) wasSignedIn.current = true
    if (!blocked) return
    // Logging out (or deactivating) on a protected page goes home, not to the login wall.
    router.replace(
      wasSignedIn.current ? "/" : `/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`
    )
  }, [blocked, signedIn, router])

  if (status === "error") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-32 text-center" role="alert">
        <p className="text-base font-semibold">We couldn’t load Mutuari</p>
        <p className="max-w-md text-sm text-muted-foreground">{error}</p>
        <Button variant="outline" onClick={retryLoad}>
          Try again
        </Button>
      </div>
    )
  }
  if (!s || blocked) {
    return (
      <div className="flex flex-1 items-center justify-center py-32" aria-busy="true">
        <div className="size-6 animate-spin rounded-full border-2 border-border border-t-foreground" />
      </div>
    )
  }
  return <>{children}</>
}
