import { useState } from "react"
import { format } from "date-fns"
import { Calendar as CalendarIcon } from "@phosphor-icons/react"
import { cn } from "@/lib/utils"
import { Calendar } from "@/components/ui/calen
  Popover,
  Popove

  date?: Date
  placeholder?: s
  disableFutureDates?: boolean

export function DatePicker(
  onDateChang
  disabled = false,
  className,
  disabled?: boolean
  disableFutureDates?: boolean
  className?: string
}

export function DatePicker({
  date,
  onDateChange,
  placeholder = "Pick a date",
  disabled = false,
  disableFutureDates = false,
  className,
}: DatePickerProps) {
  const [open, setOpen] = useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "w-full justify-start text-left font-normal",
            !date && "text-muted-foreground",
            className
          )}
          disabled={disabled}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {date ? format(date, "PPP") : <span>{placeholder}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={date}
          onSelect={(newDate) => {
            onDateChange(newDate)
            setOpen(false)
          }}
          disabled={
            disableFutureDates
              ? (date) => date > new Date()
              : undefined
          }
          initialFocus
        />
      </PopoverContent>
    </Popover>
  )
}
}: DatePickerProps) {
  const [open, setOpen] = useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "w-full justify-start text-left font-normal",
            !date && "text-muted-foreground",
            className
          )}
          disabled={disabled}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {date ? format(date, "PPP") : <span>{placeholder}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={date}
          onSelect={(newDate) => {
            onDateChange(newDate)
            setOpen(false)
          }}
          disabled={
            disableFutureDates
              ? (date) => date > new Date()
              : undefined
          }
          initialFocus
        />
      </PopoverContent>
    </Popover>
  )
}
