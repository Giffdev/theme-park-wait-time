import { useState } from "react"
import { CaretLeft, CaretRight, CaretUp, CaretDown } from "@phosphor-icons/react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

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
  showClearButton = false,
  showTodayButton = false,
}: EnhancedCalendarProps) {
  const today = new Date()
  const [currentMonth, setCurrentMonth] = useState(selected || today)
  const [isMonthYearOpen, setIsMonthYearOpen] = useState(false)

  const handleDateSelect = (date: Date) => {
    if (disabled && disabled(date)) {
      return
    }
    onSelect(date)
  }

  const handleClear = () => {
    onSelect(undefined)
  }

  const handleToday = () => {
    setCurrentMonth(today)
    onSelect(today)
  }

  const handlePreviousMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))
  }

  const handleNextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))
  }

  const weekDays = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear()
    const month = date.getMonth()
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)
    const daysInMonth = lastDay.getDate()
    const startingDayOfWeek = firstDay.getDay()

    const days: (Date | null)[] = []
    
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(null)
    }
    
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(new Date(year, month, i))
    }

    return days
  }

  const days = getDaysInMonth(currentMonth)
  const monthName = currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  return (
    <div className={cn("p-3", className)}>
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-center gap-2">
            <button
              className={cn(
                "inline-flex items-center justify-center text-sm font-medium hover:bg-accent hover:text-accent-foreground h-7 w-full rounded-md px-3",
                isMonthYearOpen && "bg-accent"
              )}
              onClick={() => setIsMonthYearOpen(!isMonthYearOpen)}
            >
              {monthName}
              {isMonthYearOpen ? (
                <CaretUp className="h-3 w-3 ml-1" />
              ) : (
                <CaretDown className="h-3 w-3 ml-1" />
              )}
            </button>
          </div>
          
          <div className="flex items-center justify-center gap-1">
            <Button
              variant="outline"
              className="h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100"
              size="icon"
              onClick={handlePreviousMonth}
            >
              <CaretLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              className="h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100"
              size="icon"
              onClick={handleNextMonth}
            >
              <CaretRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="w-full">
          <div className="grid grid-cols-7 mb-2">
            {weekDays.map((day) => (
              <div
                key={day}
                className="text-muted-foreground text-[0.8rem] font-normal h-9 w-9 flex items-center justify-center"
              >
                {day}
              </div>
            ))}
          </div>
          
          <div className="grid grid-cols-7 gap-1">
            {days.map((day, index) => {
              if (!day) {
                return <div key={`empty-${index}`} className="h-9 w-9" />
              }

              const isSelected = selected && day.toDateString() === selected.toDateString()
              const isToday = day.toDateString() === today.toDateString()
              const isDisabled = disabled && disabled(day)

              return (
                <button
                  key={day.toDateString()}
                  onClick={() => handleDateSelect(day)}
                  disabled={isDisabled}
                  className={cn(
                    "h-9 w-9 p-0 font-normal text-sm rounded-md",
                    "hover:bg-accent hover:text-accent-foreground",
                    isSelected && "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground",
                    isToday && !isSelected && "bg-accent text-accent-foreground",
                    isDisabled && "opacity-50 cursor-not-allowed hover:bg-transparent"
                  )}
                >
                  {day.getDate()}
                </button>
              )
            })}
          </div>
        </div>

        <div className="flex gap-2">
          {showClearButton && (
            <Button variant="outline" className="flex-1" onClick={handleClear}>
              Clear
            </Button>
          )}
          {showTodayButton && (
            <Button variant="outline" className="flex-1" onClick={handleToday}>
              Today
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
