import * as React from "react"
import { CalendarIcon } from "lucide-react"
import { format } from "date-fns"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

interface DatePickerProps {
  date?: Date
  onDateChange?: (date: Date | undefined) => void
  disabled?: boolean
  placeholder?: string
  maxDate?: Date
  minDate?: Date
  className?: string
}

export function DatePicker({ 
  date, 
  onDateChange, 
  disabled = false,
  placeholder = "Pick a date",
  maxDate,
  minDate,
  className
}: DatePickerProps) {
  return (
    <div className={className}>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant={"outline"}
            className={cn(
              "w-full justify-start text-left font-normal",
              !date && "text-muted-foreground"
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
            initialFocus
            disabled={(date) => {
              if (maxDate && date > maxDate) return true
              if (minDate && date < minDate) return true
              return false
            }}
          />
        </PopoverContent>
      </Popover>
    </div>
  )
}