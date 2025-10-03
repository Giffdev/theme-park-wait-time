import * as React from "react"
import { format } from "date-fns"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { CalendarIcon } from "lucide-react"

interface DatePickerProps {
  date?: Date
  onDateChange?: (date: Date | undefined) => void
  disabled?: boolean
  minDate?: Date
  maxDate?: Date
  placeholder?: string
  className?: string
}

export function DatePicker({
  date,
  onDateChange,
  disabled = false,
  minDate,
  maxDate,
  placeholder = "Pick a date",
  className,
}: DatePickerProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "w-[280px] justify-start text-left font-normal",
            !date && "text-muted-foreground",
            className
          )}
          disabled={disabled}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {date ? format(date, "PPP") : <span>{placeholder}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0">
        <Calendar
          mode="single"
          selected={date}
          onSelect={onDateChange}
          disabled={(date) =>
            disabled || 
            (minDate ? date < minDate : false) ||
            (maxDate ? date > maxDate : false)
          }
          initialFocus
        />
      </PopoverContent>
    </Popover>
  )
}