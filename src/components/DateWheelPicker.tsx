import React, { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'

interface DateWheelPickerProps {
  date: Date
  onDateChange: (date: Date) => void
  placeholder?: string
  className?: string
  disabled?: boolean
}

export function DateWheelPicker({
  date,
  onDateChange,
  placeholder = "Pick a date",
  className,
  disabled = false
}: DateWheelPickerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const monthRef = useRef<HTMLDivElement>(null)
  const dayRef = useRef<HTMLDivElement>(null)
  const yearRef = useRef<HTMLDivElement>(null)
  
  const currentDate = new Date()
  const selectedMonth = date.getMonth()
  const selectedDay = date.getDate()
  const selectedYear = date.getFullYear()

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

  const handleWheelScroll = (element: HTMLDivElement | null, items: any[], getValue: (item: any, index?: number) => number, onChange: (value: number) => void) => {
    if (!element) return

    const handleScroll = (e: WheelEvent) => {
      e.preventDefault()
      e.stopPropagation()
      
      const itemHeight = 40 // Height of each item
      const containerHeight = element.clientHeight
      const centerIndex = Math.floor(containerHeight / itemHeight / 2)
      
      const currentScroll = element.scrollTop
      const delta = e.deltaY > 0 ? itemHeight : -itemHeight
      const newScroll = Math.max(0, Math.min(currentScroll + delta, (items.length - 1) * itemHeight))
      
      element.scrollTop = newScroll
      
      const newIndex = Math.round(newScroll / itemHeight)
      const selectedValue = getValue(items[newIndex], newIndex)
      onChange(selectedValue)
    }

    element.addEventListener('wheel', handleScroll, { passive: false })
    return () => element.removeEventListener('wheel', handleScroll)
  }

  // Center the selected values when opening
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        if (monthRef.current) {
          monthRef.current.scrollTop = selectedMonth * 40
        }
        if (dayRef.current) {
          dayRef.current.scrollTop = (selectedDay - 1) * 40
        }
        if (yearRef.current) {
          const yearIndex = years.indexOf(selectedYear)
          yearRef.current.scrollTop = yearIndex * 40
        }
      }, 50)
    }
  }, [isOpen, selectedMonth, selectedDay, selectedYear, years])

  // Set up wheel event listeners
  useEffect(() => {
    if (!isOpen) return

    const cleanupMonth = handleWheelScroll(
      monthRef.current,
      months,
      (_, index) => index ?? 0,
      (month: number) => {
        const newDate = new Date(selectedYear, month, Math.min(selectedDay, getDaysInMonth(month, selectedYear)))
        onDateChange(newDate)
      }
    )

    const cleanupDay = handleWheelScroll(
      dayRef.current,
      days,
      (day) => day,
      (day: number) => {
        const newDate = new Date(selectedYear, selectedMonth, day)
        onDateChange(newDate)
      }
    )

    const cleanupYear = handleWheelScroll(
      yearRef.current,
      years,
      (year) => year,
      (year: number) => {
        const newDate = new Date(year, selectedMonth, Math.min(selectedDay, getDaysInMonth(selectedMonth, year)))
        onDateChange(newDate)
      }
    )

    return () => {
      cleanupMonth?.()
      cleanupDay?.()
      cleanupYear?.()
    }
  }, [isOpen, months, days, years, selectedMonth, selectedDay, selectedYear, onDateChange])

  const formatDate = (date: Date) => {
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(today.getDate() - 1)
    
    if (date.toDateString() === today.toDateString()) {
      return `Today (${date.toLocaleDateString()})`
    } else if (date.toDateString() === yesterday.toDateString()) {
      return `Yesterday (${date.toLocaleDateString()})`
    } else {
      return date.toLocaleDateString()
    }
  }

  const WheelColumn = ({ 
    items, 
    selectedValue, 
    wheelRef, 
    renderItem 
  }: { 
    items: any[], 
    selectedValue: any, 
    wheelRef: React.RefObject<HTMLDivElement>,
    renderItem: (item: any, index: number) => React.ReactNode
  }) => (
    <div className="flex-1 relative">
      <div 
        ref={wheelRef}
        className="h-40 overflow-hidden relative"
        style={{ scrollBehavior: 'smooth' }}
      >
        <div className="py-16">
          {items.map((item, index) => (
            <div
              key={index}
              className={cn(
                "h-10 flex items-center justify-center text-sm cursor-pointer transition-all",
                item === selectedValue 
                  ? "text-primary font-semibold scale-110" 
                  : "text-muted-foreground hover:text-foreground"
              )}
              onClick={() => {
                if (wheelRef.current) {
                  wheelRef.current.scrollTop = index * 40
                }
              }}
            >
              {renderItem(item, index)}
            </div>
          ))}
        </div>
      </div>
      
      {/* Selection indicator */}
      <div className="absolute inset-x-0 top-1/2 transform -translate-y-1/2 pointer-events-none">
        <div className="h-10 border-t border-b border-primary/20 bg-primary/5"></div>
      </div>
    </div>
  )

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
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
          <Calendar className="mr-2 h-4 w-4" />
          {date ? formatDate(date) : <span>{placeholder}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        <div className="p-4">
          <h4 className="font-medium text-center mb-4">Select Visit Date</h4>
          <div className="flex gap-2">
            <WheelColumn
              items={months}
              selectedValue={months[selectedMonth]}
              wheelRef={monthRef as React.RefObject<HTMLDivElement>}
              renderItem={(month) => month.slice(0, 3)}
            />
            <WheelColumn
              items={days}
              selectedValue={selectedDay}
              wheelRef={dayRef as React.RefObject<HTMLDivElement>}
              renderItem={(day) => day}
            />
            <WheelColumn
              items={years}
              selectedValue={selectedYear}
              wheelRef={yearRef as React.RefObject<HTMLDivElement>}
              renderItem={(year) => year}
            />
          </div>
          <div className="mt-4 pt-3 border-t text-center">
            <p className="text-xs text-muted-foreground mb-2">
              Selected: {formatDate(date)}
            </p>
            <Button 
              size="sm" 
              onClick={() => setIsOpen(false)}
              className="w-full"
            >
              Done
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}