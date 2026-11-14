"use client"

import { useRef, useState } from "react"
import Link from "next/link"
import { cn } from "cn"
import type { VariantProps } from "class-variance-authority"
import {
  Calendar as CalendarIcon,
  Camera,
  Check,
  ChevronLeft,
  Star,
  X,
  type LucideIcon,
} from "lucide-react"
import { toast } from "sonner"

import { buttonVariants } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Checkbox } from "@/components/ui/checkbox"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { fileToDataUrl, fmt, iso, toDate } from "@/lib/format"

// ---------- layout ----------

export function Panel({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("flex flex-col gap-5 rounded-xl border bg-card p-6 shadow-card", className)}
      {...props}
    />
  )
}

export function PanelHeader({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children?: React.ReactNode
}) {
  return (
    <div className="flex items-start gap-4">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <h2 className="text-base font-semibold">{title}</h2>
        {description && <p className="text-[13px] text-muted-foreground">{description}</p>}
      </div>
      {children}
    </div>
  )
}

export function PageTitle({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children?: React.ReactNode
}) {
  return (
    <div className="flex flex-wrap items-end gap-4">
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <h1 className="text-[28px] leading-tight font-semibold tracking-[-0.56px]">{title}</h1>
        {description && <p className="text-[15px] text-muted-foreground">{description}</p>}
      </div>
      {children}
    </div>
  )
}

export function BackLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex w-fit items-center gap-1 text-[13px] font-medium text-muted-foreground hover:text-foreground"
    >
      <ChevronLeft className="size-3.5" />
      {children}
    </Link>
  )
}

export function LinkButton({
  href,
  variant,
  size,
  className,
  ...props
}: React.ComponentProps<typeof Link> & VariantProps<typeof buttonVariants>) {
  return <Link href={href} className={cn(buttonVariants({ variant, size }), className)} {...props} />
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: LucideIcon
  title: string
  description?: string
  children?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-12 text-center">
      <div className="flex size-10 items-center justify-center rounded-[10px] bg-muted">
        <Icon className="size-[18px]" />
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-[15px] font-semibold">{title}</p>
        {description && <p className="max-w-sm text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
    </div>
  )
}

// ---------- display ----------

/** Shown when a listing has no photo: an empty hanger in the same style as the sample photos. */
const NO_PHOTO = "/art/no-photo.jpg"

export function Photo({
  label,
  src,
  alt,
  fit = "cover",
  className,
  children,
}: {
  label?: string
  src?: string
  alt?: string
  /** "contain" shows the whole photo instead of cropping it to the box. */
  fit?: "cover" | "contain"
  className?: string
  children?: React.ReactNode
}) {
  return (
    <div
      className={cn(
        "relative flex flex-col items-center justify-center gap-2 overflow-hidden rounded-xl bg-muted text-muted-foreground",
        className
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- user uploads are data URLs */}
      <img
        src={src ?? NO_PHOTO}
        alt={src ? (alt ?? label ?? "") : "No photo yet"}
        className={cn("absolute inset-0 size-full", src && fit === "contain" ? "object-contain" : "object-cover")}
      />
      {children}
    </div>
  )
}

export function Rating({ value, count, className }: { value: number; count?: number; className?: string }) {
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1 text-[13px] font-medium", className)}>
      <Star className="size-3.5 fill-amber-400 text-amber-400" />
      {value ? value.toFixed(1) : "New"}
      {count !== undefined && <span className="font-normal text-muted-foreground">({count} ratings)</span>}
    </span>
  )
}

export function PersonAvatar({
  initials,
  src,
  className,
}: {
  initials: string
  src?: string
  className?: string
}) {
  return (
    <span
      className={cn(
        "flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full border bg-muted text-xs font-medium text-muted-foreground",
        className
      )}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- user uploads are data URLs
        <img src={src} alt="" className="size-full object-cover" />
      ) : (
        initials
      )}
    </span>
  )
}

export function IconTile({ icon: Icon, className }: { icon: LucideIcon; className?: string }) {
  return (
    <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted", className)}>
      <Icon className="size-4" />
    </span>
  )
}

export function InfoRow({ icon, title, text }: { icon: LucideIcon; title: string; text: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3.5">
      <IconTile icon={icon} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-sm leading-normal text-muted-foreground">{text}</p>
      </div>
    </div>
  )
}

export function Row({
  label,
  value,
  strong,
}: {
  label: React.ReactNode
  value: React.ReactNode
  strong?: boolean
}) {
  return (
    <div className={cn("flex items-center justify-between gap-4 text-sm", strong && "font-semibold")}>
      <span className={strong ? undefined : "text-muted-foreground"}>{label}</span>
      <span className="text-right">{value}</span>
    </div>
  )
}

export function CheckLine({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
      <Check className="size-3.5 shrink-0 text-foreground" />
      {children}
    </p>
  )
}

export function Stepper({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol className="flex items-center gap-3">
      {steps.map((step, i) => {
        const done = i < current
        const active = i === current
        return (
          <li key={step} className={cn("flex items-center gap-3", i < steps.length - 1 && "flex-1")}>
            <span className="flex items-center gap-2">
              <span
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                  done || active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                )}
              >
                {done ? <Check className="size-3.5" /> : i + 1}
              </span>
              <span className={cn("text-sm font-medium", !done && !active && "text-muted-foreground")}>{step}</span>
            </span>
            {i < steps.length - 1 && <span className={cn("h-px flex-1", done ? "bg-primary" : "bg-border")} />}
          </li>
        )
      })}
    </ol>
  )
}

export const RENTAL_STEPS = ["Try-on", "Reserve", "Pickup", "Return", "Review"]

// ---------- form ----------

export function Field({
  label,
  hint,
  className,
  children,
}: {
  label: string
  hint?: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <label className={cn("flex min-w-0 flex-col gap-2", className)}>
      <span className="text-sm leading-[17px] font-medium">{label}</span>
      {children}
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </label>
  )
}

/** A group of controls with a heading (not a single labelled input). */
export function FieldGroup({
  label,
  className,
  children,
}: {
  label: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={cn("flex flex-col gap-2", className)} role="group" aria-label={label}>
      <span className="text-sm leading-[17px] font-medium">{label}</span>
      {children}
    </div>
  )
}

export function Chip({
  selected,
  onClick,
  children,
}: {
  selected?: boolean
  onClick?: () => void
  children: React.ReactNode
}) {
  const className = cn(
    "inline-flex h-[30px] items-center rounded-full border px-3 text-[13px] font-medium whitespace-nowrap transition-colors",
    selected
      ? "border-primary bg-primary text-primary-foreground"
      : "border-border bg-background text-foreground",
    onClick && !selected && "hover:bg-muted"
  )
  if (!onClick) return <span className={className}>{children}</span>
  return (
    <button type="button" aria-pressed={Boolean(selected)} onClick={onClick} className={className}>
      {children}
    </button>
  )
}

export function ChipGroup({
  options,
  value,
  onChange,
  single,
}: {
  options: string[]
  value: string[]
  onChange: (next: string[]) => void
  single?: boolean
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = value.includes(o)
        return (
          <Chip
            key={o}
            selected={on}
            onClick={() =>
              onChange(single ? (on ? [] : [o]) : on ? value.filter((v) => v !== o) : [...value, o])
            }
          >
            {o}
          </Chip>
        )
      })}
    </div>
  )
}

export function CheckItem({
  checked,
  onChange,
  disabled,
  children,
}: {
  checked: boolean
  onChange?: (checked: boolean) => void
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <label className="flex w-fit items-center gap-2 text-sm">
      <Checkbox
        checked={checked}
        disabled={disabled}
        onCheckedChange={(v) => onChange?.(Boolean(v))}
      />
      {children}
    </label>
  )
}

export function RadioCard({
  selected,
  onSelect,
  title,
  description,
}: {
  selected: boolean
  onSelect: () => void
  title: string
  description: string
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        "flex w-full items-start gap-3.5 rounded-[10px] border p-4 text-left transition-colors",
        selected ? "border-primary bg-subtle" : "hover:bg-subtle"
      )}
    >
      <span
        className={cn(
          "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border",
          selected ? "border-primary" : "border-ring"
        )}
      >
        {selected && <span className="size-2 rounded-full bg-primary" />}
      </span>
      <span className="flex flex-col gap-1">
        <span className="text-sm font-medium">{title}</span>
        <span className="text-[13px] text-muted-foreground">{description}</span>
      </span>
    </button>
  )
}

export function PhotoSlot({
  label,
  value,
  onChange,
  className,
}: {
  label: string
  value?: string
  onChange: (dataUrl: string | undefined) => void
  className?: string
}) {
  const input = useRef<HTMLInputElement>(null)
  return (
    <div
      className={cn(
        "relative flex h-[120px] flex-col items-center justify-center gap-2 overflow-hidden rounded-[10px] border border-dashed border-ring bg-subtle text-muted-foreground",
        className
      )}
    >
      {value ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element -- user uploads are data URLs */}
          <img src={value} alt={label} className="absolute inset-0 size-full object-cover" />
          <span className="absolute bottom-1.5 left-1.5 rounded-md bg-background/90 px-1.5 py-0.5 text-[11px] font-medium text-foreground">
            {label}
          </span>
          <button
            type="button"
            aria-label={`Remove ${label} photo`}
            onClick={() => onChange(undefined)}
            className="absolute top-1.5 right-1.5 flex size-6 items-center justify-center rounded-full bg-background/90 text-foreground hover:bg-background"
          >
            <X className="size-3.5" />
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => input.current?.click()}
          className="flex size-full flex-col items-center justify-center gap-2 hover:bg-muted"
        >
          <Camera className="size-[18px]" />
          <span className="text-xs font-medium">{label}</span>
        </button>
      )}
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0]
          e.target.value = ""
          if (!file) return
          try {
            onChange(await fileToDataUrl(file))
          } catch {
            toast.error("That file couldn't be read as an image.")
          }
        }}
      />
    </div>
  )
}

export function DateField({
  value,
  onChange,
  placeholder = "Pick a date",
  min,
  pattern = "EEE, MMM d",
  className,
}: {
  value?: string
  onChange: (value: string | undefined) => void
  placeholder?: string
  min?: string
  pattern?: string
  className?: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className={cn(
          "flex h-9 w-full items-center gap-2 rounded-lg border border-input bg-background px-3 text-left text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
          className
        )}
      >
        <CalendarIcon className="size-4 shrink-0 text-muted-foreground" />
        <span className={cn("truncate", !value && "text-muted-foreground")}>
          {value ? fmt(value, pattern) : placeholder}
        </span>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={value ? toDate(value) : undefined}
          defaultMonth={value ? toDate(value) : min ? toDate(min) : undefined}
          disabled={min ? { before: toDate(min) } : undefined}
          onSelect={(d) => {
            onChange(d ? iso(d) : undefined)
            setOpen(false)
          }}
        />
      </PopoverContent>
    </Popover>
  )
}

export function SegTabs<T extends string>({
  value,
  onChange,
  items,
  className,
}: {
  value: T
  onChange: (value: T) => void
  items: { value: T; label: string }[]
  className?: string
}) {
  return (
    <Tabs value={value} onValueChange={(v) => onChange(v as T)} className={cn("w-fit max-w-full", className)}>
      <TabsList className="overflow-x-auto p-1 group-data-horizontal/tabs:h-[37px]">
        {items.map((item) => (
          <TabsTrigger key={item.value} value={item.value} className="px-3">
            {item.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}

export function SimpleSelect({
  value,
  onChange,
  options,
  placeholder = "Select",
  ariaLabel,
  className,
}: {
  value: string
  onChange: (value: string) => void
  options: (string | { value: string; label: string })[]
  placeholder?: string
  ariaLabel?: string
  className?: string
}) {
  const opts = options.map((o) => (typeof o === "string" ? { value: o, label: o } : o))
  return (
    <Select value={value || null} onValueChange={(v) => onChange((v as string | null) ?? "")}>
      <SelectTrigger aria-label={ariaLabel} className={cn("w-full bg-background data-[size=default]:h-9", className)}>
        <SelectValue>
          {(v: string | null) =>
            v ? (opts.find((o) => o.value === v)?.label ?? v) : <span className="text-muted-foreground">{placeholder}</span>
          }
        </SelectValue>
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false}>
        {opts.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export function DateRangeField({
  start,
  end,
  onChange,
  placeholder = "Add dates",
  className,
  bare,
}: {
  start?: string
  end?: string
  onChange: (start: string | undefined, end: string | undefined) => void
  placeholder?: string
  className?: string
  /** No border or padding, for use inside a composite search bar. */
  bare?: boolean
}) {
  const [open, setOpen] = useState(false)
  const label = start ? (end && end !== start ? `${fmt(start, "MMM d")} – ${fmt(end, "MMM d")}` : fmt(start, "MMM d")) : placeholder
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className={cn(
          "flex items-center gap-2 text-left text-sm outline-none",
          bare
            ? "gap-1.5 rounded-sm focus-visible:ring-3 focus-visible:ring-ring/50"
            : "h-9 w-full rounded-lg border border-input bg-background px-3 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
          className
        )}
      >
        <CalendarIcon className={cn("shrink-0 text-muted-foreground", bare ? "size-3.5" : "size-4")} />
        <span className={cn("truncate", !start && "text-muted-foreground")}>{label}</span>
      </PopoverTrigger>
      <PopoverContent className="w-auto gap-0 p-0" align="start">
        {/* Rendered only while open so "today" is read in the browser, not at prerender. */}
        {open && (
          <Calendar
            mode="range"
            selected={start ? { from: toDate(start), to: end ? toDate(end) : undefined } : undefined}
            disabled={{ before: new Date() }}
            onSelect={(r) => onChange(r?.from ? iso(r.from) : undefined, r?.to ? iso(r.to) : undefined)}
          />
        )}
        <div className="flex justify-between border-t p-2">
          <button type="button" className="px-2 text-[13px] text-muted-foreground hover:text-foreground" onClick={() => onChange(undefined, undefined)}>
            Clear
          </button>
          <button type="button" className="px-2 text-[13px] font-medium" onClick={() => setOpen(false)}>
            Done
          </button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
