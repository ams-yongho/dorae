"use client"

import * as React from "react"
import { format } from "date-fns"
import { ko } from "date-fns/locale"
import { CalendarIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

interface DatePickerProps {
  name?: string
  defaultValue?: string | Date | null
  required?: boolean
  placeholder?: string
  className?: string
  id?: string
}

function toDate(value: string | Date | null | undefined): Date | undefined {
  if (!value) return undefined
  if (value instanceof Date) return value
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? undefined : d
}

function toIsoDate(value: Date | undefined): string {
  if (!value) return ""
  const y = value.getFullYear()
  const m = String(value.getMonth() + 1).padStart(2, "0")
  const d = String(value.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

export function DatePicker({
  name,
  defaultValue,
  required,
  placeholder = "날짜를 선택하세요",
  className,
  id,
}: DatePickerProps) {
  const [date, setDate] = React.useState<Date | undefined>(() =>
    toDate(defaultValue)
  )

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            id={id}
            type="button"
            variant="outline"
            className={cn(
              "w-full justify-start border-border font-normal",
              !date && "text-muted-foreground",
              className
            )}
          />
        }
      >
        <CalendarIcon className="size-4" />
        <span className="font-mono">
          {date ? format(date, "yyyy-MM-dd", { locale: ko }) : placeholder}
        </span>
      </PopoverTrigger>
      <PopoverContent className="p-0">
        <Calendar
          mode="single"
          selected={date}
          onSelect={setDate}
          captionLayout="dropdown"
          defaultMonth={date}
          autoFocus
        />
      </PopoverContent>
      {name && (
        <input
          type="hidden"
          name={name}
          value={toIsoDate(date)}
          required={required}
        />
      )}
    </Popover>
  )
}
