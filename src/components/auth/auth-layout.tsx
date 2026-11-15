"use client"

import { toast } from "sonner"

import { Photo } from "@/components/kit"
import { Logo } from "@/components/site/logo"
import { Button } from "@/components/ui/button"

export function AuthLayout({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle: string
  children: React.ReactNode
}) {
  return (
    <main className="grid min-h-screen flex-1 lg:grid-cols-2">
      <div className="flex flex-col items-center px-6 py-10">
        <div className="w-full max-w-[400px]">
          <Logo className="h-20" />
        </div>
        <div className="flex w-full max-w-[400px] flex-1 flex-col justify-center gap-5 py-10">
          <div className="flex flex-col gap-2">
            <h1 className="text-[28px] leading-tight font-semibold tracking-[-0.56px]">{title}</h1>
            <p className="text-[15px] text-muted-foreground">{subtitle}</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {["Google", "Apple"].map((provider) => (
              <Button
                key={provider}
                type="button"
                variant="outline"
                onClick={() =>
                  toast.info(`${provider} sign-in isn't connected in this MVP yet. Use email for now.`)
                }
              >
                {provider}
              </Button>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <span className="h-px flex-1 bg-border" />
            <span className="text-[11px] font-medium tracking-wide text-muted-foreground">OR CONTINUE WITH EMAIL</span>
            <span className="h-px flex-1 bg-border" />
          </div>
          {children}
        </div>
        <p className="text-xs text-muted-foreground">
          By continuing you agree to the Terms and the Cleaning &amp; Damage Policy.
        </p>
      </div>
      <div className="hidden p-4 lg:block">
        <Photo src="/art/auth.jpg" alt="Outfits hanging on a clothing rail" className="size-full rounded-3xl" />
      </div>
    </main>
  )
}
