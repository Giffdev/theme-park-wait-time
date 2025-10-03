import * as React from "react"
import { Calendar as CalendarIcon } from "@phosphor-icons/react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

interface DatePickerProps {
  date?: Date
  onDateChange?: (date: Date | undefined) => void
  placeholder?: string
  minDate?: Date
  maxDate?: Date
  className?: string
  disabled?: boolean
}

export function DatePicker({
  date,
  onDateChange,
  placeholder = "Pick a date",
  minDate,
  maxDate,
  className,
  disabled = false
}: DatePickerProps) {
  const formatDateForInput = (date: Date | undefined): string => {
    if (!date) return ""
    return date.toISOString().split('T')[0]
  }

  const handleDateChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value
    if (!value) {
      onDateChange?.(undefined)
      return
    }
    
    const selectedDate = new Date(value + 'T00:00:00')
    onDateChange?.(selectedDate)
  }

  const formatMinDate = minDate ? formatDateForInput(minDate) : undefined
  const formatMaxDate = maxDate ? formatDateForInput(maxDate) : undefined

  return (
    <div className={cn("relative", className)}>
      <div className="relative">
        <Input
          type="date"
          value={formatDateForInput(date)}
          onChange={handleDateChange}
          min={formatMinDate}
          max={formatMaxDate}
          disabled={disabled}
          className="pl-10"
          placeholder={placeholder}
        />
        <CalendarIcon 
          size={16} 
          className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground pointer-events-none"
        />
      </div>
    </div>
  )
}