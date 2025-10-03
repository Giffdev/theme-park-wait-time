import React, { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'

interface DateWheelPickerProps {
  date: Date | undefined
  onDateChange: (date: Date) => void
  className?: string
  placeholder?: string
}

export function DateWheelPicker({ date, onDateChange, className, placeholder }: DateWheelPickerProps) {
  const currentDate = new Date()
  const [selectedMonth, setSelectedMonth] = useState(date ? date.getMonth() : currentDate.getMonth())
  const [selectedYear, setSelectedYear] = useState(date ? date.getFullYear() : currentDate.getFullYear())
  const [selectedDay, setSelectedDay] = useState(date ? date.getDate() : currentDate.getDate())
  const [open, setOpen] = useState(false)

  const monthRef = useRef<HTMLDivElement>(null)
  const dayRef = useRef<HTMLDivElement>(null)
  const yearRef = useRef<HTMLDivElement>(null)

  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ]

  // Generate years from 2 years ago to current year
  const years = Array.from({ length: 3 }, (_, i) => currentDate.getFullYear() - 2 + i)
  
  // Generate days based on selected month/year
  const getDaysInMonth = (month: number, year: number) => {
    return new Date(year, month + 1, 0).getDate()
  }
  
  const days = Array.from({ length: getDaysInMonth(selectedMonth, selectedYear) }, (_, i) => i + 1)

  const handleWheelScroll = (element: HTMLDivElement | null, items: any[], getValue: (item: any) => number, onChange: (value: number) => void) => {
    if (!element) return

    const handleScroll = (e: WheelEvent) => {
      e.preventDefault()
      e.stopPropagation()
      
      const itemHeight = 40 // Height of each item
      const containerHeight = element.clientHeight
      
      const currentScroll = element.scrollTop
      const delta = e.deltaY > 0 ? itemHeight : -itemHeight
      const newScroll = Math.max(0, Math.min(currentScroll + delta, (items.length - 1) * itemHeight))
      
      element.scrollTop = newScroll
      
      const newIndex = Math.round(newScroll / itemHeight)
      const newValue = getValue(items[newIndex])
      onChange(newValue)
    }

    element.addEventListener('wheel', handleScroll, { passive: false })
    return () => element.removeEventListener('wheel', handleScroll)
  }

  const formatDateDisplay = (date: Date | undefined) => {
    if (!date) return placeholder || "Pick a date"
    
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)

    if (date.toDateString() === today.toDateString()) {
      return "Today"
    } else if (date.toDateString() === yesterday.toDateString()) {
      return "Yesterday"
    }

    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short', 
      day: 'numeric'
    })
  }

  const WheelPicker = ({ 
    selectedValue, 
    items, 
    renderItem, 
    wheelRef, 
  }: { 
    selectedValue: any, 
    items: any[], 
    renderItem: (item: any, index: number) => React.ReactNode,
    wheelRef: React.RefObject<HTMLDivElement | null>
  }) => (
    <div className="relative h-32 overflow-hidden">
      <div 
        ref={wheelRef}
        className="h-full overflow-y-auto scrollbar-hide"
        style={{ scrollBehavior: 'smooth' }}
      >
        <div className="py-12">
          {items.map((item, index) => (
            <div
              key={index}
              className={cn(
                "h-10 flex items-center justify-center text-sm transition-colors",
                item === selectedValue 
                  ? "text-primary font-medium" 
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {renderItem(item, index)}
            </div>
          ))}
        </div>
      </div>
      {/* Selection indicator */}
      <div className="absolute top-1/2 left-0 right-0 h-10 -translate-y-1/2 border-t border-b border-border bg-accent/10 pointer-events-none" />
    </div>
  )

  const handleConfirm = () => {
    const newDate = new Date(selectedYear, selectedMonth, selectedDay)
    onDateChange(newDate)
    setOpen(false)
  }

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
        >
          <Calendar className="mr-2 h-4 w-4" />
          {formatDateDisplay(date)}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        <div className="p-4">
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-2 block">Month</label>
              <WheelPicker
                selectedValue={selectedMonth}
                items={months}
                renderItem={(month, index) => month}
                wheelRef={monthRef}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-2 block">Day</label>
              <WheelPicker
                selectedValue={selectedDay}
                items={days}
                renderItem={(day) => day}
                wheelRef={dayRef}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-2 block">Year</label>
              <WheelPicker
                selectedValue={selectedYear}
                items={years}
                renderItem={(year) => year}
                wheelRef={yearRef}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleConfirm}>
              Confirm
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}