"use client"

import { Photo } from "@/components/kit"
import { Logo } from "@/components/site/logo"
import { buttonVariants } from "@/components/ui/button"

/** Google's "G" mark, in its own colours as its sign-in guidelines ask. */
function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" className={className}>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  )
}

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
          <Logo className="size-14 rounded-xl" />
        </div>
        <div className="flex w-full max-w-[400px] flex-1 flex-col justify-center gap-5 py-10">
          <div className="flex flex-col gap-2">
            <h1 className="text-[28px] leading-tight font-semibold tracking-[-0.56px]">{title}</h1>
            <p className="text-[15px] text-muted-foreground">{subtitle}</p>
          </div>
          {/* A plain link: the server sends the browser on to Google, then back signed in. */}
          <a
            href="/api/auth/google"
            onClick={(e) => {
              // Come back to the page the visitor was heading for.
              const next = new URLSearchParams(window.location.search).get("next")
              if (next) e.currentTarget.href = `/api/auth/google?next=${encodeURIComponent(next)}`
            }}
            className={buttonVariants({ variant: "outline", className: "h-10 w-full gap-2.5" })}
          >
            <GoogleIcon className="size-[18px]" />
            Continue with Google
          </a>
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
