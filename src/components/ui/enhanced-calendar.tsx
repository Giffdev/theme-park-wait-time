import { useState } from "react"
import { format, addMonths, subMonths, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, isToday, startOfWeek, endOfWeek, setMonth, setYear } from "date-fns"
import { CaretUp, CaretDown, CaretLeft, CaretRight } from "@phosphor-icons/react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

interface EnhancedCalendarProps {
  selected?: Date
  onSelect: (date: Date | undefined) => void
  disabled?: (date: Date) => boolean
  className?: string
  showClearButton?: boolean
  showTodayButton?: boolean
}

export function EnhancedCalendar({
  selected,
  onSelect,
  disabled,
  className,
  showClearButton = true,
  showTodayButton = true,
}: EnhancedCalendarProps) {
  const [currentMonth, setCurrentMonth] = useState(selected || new Date())
  const [isMonthYearOpen, setIsMonthYearOpen] = useState(false)

  const monthStart = startOfMonth(currentMonth)
  const monthEnd = endOfMonth(currentMonth)
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 0 })
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 0 })
  
  const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd })

  const handlePreviousMonth = () => {
    setCurrentMonth(subMonths(currentMonth, 1))
  }

  const handleNextMonth = () => {
    setCurrentMonth(addMonths(currentMonth, 1))
  }

  const handleDateClick = (date: Date) => {
    if (disabled && disabled(date)) {
      return
    }
    onSelect(date)
  }

  const handleClear = () => {
    onSelect(undefined)
  }

  const handleToday = () => {
    const today = new Date()
    setCurrentMonth(today)
    onSelect(today)
  }

  const handleMonthChange = (monthIndex: string) => {
    setCurrentMonth(setMonth(currentMonth, parseInt(monthIndex)))
  }

  const handleYearChange = (year: string) => {
    setCurrentMonth(setYear(currentMonth, parseInt(year)))
  }

  const weekDays = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ]

  const currentYear = currentMonth.getFullYear()
  const years = Array.from({ length: 21 }, (_, i) => currentYear - 10 + i)

  return (
    <div className={cn("p-3 bg-popover rounded-lg border shadow-md min-w-[280px]", className)}>
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-center gap-2">
          <Select value={currentMonth.getMonth().toString()} onValueChange={handleMonthChange}>
            <SelectTrigger className="h-8 w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {months.map((month, idx) => (
                <SelectItem key={idx} value={idx.toString()}>
                  {month}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={currentYear.toString()} onValueChange={handleYearChange}>
            <SelectTrigger className="h-8 w-[90px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years.map((year) => (
                <SelectItem key={year} value={year.toString()}>
                  {year}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center justify-center gap-2 mt-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={handlePreviousMonth}
          >
            <CaretLeft className="h-4 w-4" />
          </Button>
          
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={handleNextMonth}
          >
            <CaretRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="grid grid-cols-7 gap-0">
          {weekDays.map((day) => (
            <div
              key={day}
              className="h-9 w-9 flex items-center justify-center text-[0.8rem] font-normal text-muted-foreground"
            >
              {day}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-0">
          {days.map((day, idx) => {
            const isSelected = selected && isSameDay(day, selected)
            const isCurrentMonth = isSameMonth(day, currentMonth)
            const isTodayDate = isToday(day)
            const isDisabled = disabled && disabled(day)

            return (
              <button
                key={idx}
                onClick={() => handleDateClick(day)}
                disabled={isDisabled}
                className={cn(
                  "h-9 w-9 p-0 font-normal text-sm relative flex items-center justify-center rounded-md transition-colors",
                  "hover:bg-accent hover:text-accent-foreground",
                  !isCurrentMonth && "text-muted-foreground opacity-50",
                  isSelected && "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground",
                  isTodayDate && !isSelected && "bg-accent text-accent-foreground font-semibold",
                  isDisabled && "opacity-50 cursor-not-allowed hover:bg-transparent"
                )}
              >
                {format(day, 'd')}
              </button>
            )
          })}
        </div>

        <div className="flex items-center justify-between border-t pt-3">
          {showClearButton && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClear}
              className="text-primary hover:text-primary"
            >
              Clear
            </Button>
          )}
          {showTodayButton && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleToday}
              className="text-primary hover:text-primary ml-auto"
            >
              Today
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
