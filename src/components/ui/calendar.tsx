"use client"

import * as React from "react"
import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronUpIcon,
} from "lucide-react"
import { DayPicker, type DropdownProps } from "react-day-picker"
import { ko } from "date-fns/locale"

import { cn } from "@/lib/utils"
import { buttonVariants } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export type CalendarProps = React.ComponentProps<typeof DayPicker>

function CalendarDropdown({
  options,
  value,
  onChange,
  "aria-label": ariaLabel,
}: DropdownProps) {
  const handleValueChange = (next: string | null) => {
    if (!onChange || next == null) return
    onChange({
      target: { value: next },
    } as unknown as React.ChangeEvent<HTMLSelectElement>)
  }

  const items = React.useMemo(
    () =>
      (options ?? []).map((opt) => ({
        value: opt.value.toString(),
        label: opt.label,
      })),
    [options]
  )

  return (
    <Select
      value={value?.toString()}
      onValueChange={handleValueChange}
      items={items}
    >
      <SelectTrigger
        aria-label={ariaLabel}
        size="sm"
        className="w-auto min-w-[4rem] border-border bg-paper px-2 text-xs font-medium text-ink"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="max-h-60">
        {(options ?? []).map((option) => (
          <SelectItem
            key={option.value}
            value={option.value.toString()}
            disabled={option.disabled}
          >
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  captionLayout = "dropdown",
  startMonth = new Date(1950, 0),
  endMonth = new Date(2100, 11),
  ...props
}: CalendarProps) {
  return (
    <DayPicker
      locale={ko}
      showOutsideDays={showOutsideDays}
      captionLayout={captionLayout}
      startMonth={startMonth}
      endMonth={endMonth}
      className={cn("p-3", className)}
      classNames={{
        months: "relative flex flex-col gap-3",
        month: "flex flex-col gap-3",
        month_caption: "flex h-7 justify-center items-center gap-1.5 px-9",
        caption_label: "text-sm font-medium text-ink",
        dropdowns: "flex items-center gap-1.5",
        dropdown_root: "inline-flex items-center",
        dropdown: "sr-only",
        nav: "absolute inset-x-0 top-0 flex h-7 items-center justify-between pointer-events-none",
        button_previous: cn(
          buttonVariants({ variant: "outline", size: "icon-sm" }),
          "size-7 bg-paper border-border opacity-80 hover:opacity-100 pointer-events-auto"
        ),
        button_next: cn(
          buttonVariants({ variant: "outline", size: "icon-sm" }),
          "size-7 bg-paper border-border opacity-80 hover:opacity-100 pointer-events-auto"
        ),
        month_grid: "w-full border-collapse",
        weekdays: "flex",
        weekday:
          "text-stone w-9 font-normal text-[0.7rem] uppercase tracking-wide",
        week: "flex w-full mt-1",
        day: "relative size-9 p-0 text-center text-sm focus-within:relative focus-within:z-20",
        day_button: cn(
          buttonVariants({ variant: "ghost" }),
          "size-9 p-0 font-normal rounded-md hover:bg-accent"
        ),
        selected:
          "[&_button]:bg-coral [&_button]:text-white [&_button]:hover:bg-coral-dark [&_button]:hover:text-white",
        today: "[&_button]:ring-1 [&_button]:ring-coral/40",
        outside: "text-stone/40",
        disabled: "text-stone/30 opacity-50",
        hidden: "invisible",
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation }) => {
          if (orientation === "left") return <ChevronLeftIcon className="size-4" />
          if (orientation === "right") return <ChevronRightIcon className="size-4" />
          if (orientation === "up") return <ChevronUpIcon className="size-4" />
          return <ChevronDownIcon className="size-4" />
        },
        Dropdown: CalendarDropdown,
      }}
      {...props}
    />
  )
}

export { Calendar }
