import { useState } from "react"
import { CaretUp, CaretDown, CaretLeft, CaretRight } from "@phosphor-icons/react"
import { Button } from "@/components/ui/button"
interface EnhancedCalendarProps 
  onSelect: (date: Date | undefined) => void

  showTodayButton?: boolean

  onSelect: (date: Date | undefined) => void
  disabled?: (date: Date) => boolean
  className?: string
  showClearButton?: boolean
  showTodayButton?: boolean
}

export function EnhancedCalendar({

    setCurr

    setCurre

    if (disabled && disab
    }
  }
  const handleClear = () => {

  const handleToday = () => {
    setCurrentMonth(today)
  }
  const weekDays = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
  
      <div className="flex flex-col gap-3">

            size="icon"
            onClick={handlePreviousMonth}
   

            <button
              onClick={() => setIsMonthYearOpen
   

                <CaretDown className="h-3 w
            </button>

     
            classN
   


          {weekDays.map
   

            </div>
        </div>
        <div className="gr
            const i
   

              <button

          
                  "hover:bg-accent hover:text-accent-foreground",
                  isSelected && "bg-primary
                  isDisabled && "opacity-50 cursor-not-allo
              >
              </button>
          })}

          {showClearButton && (
           
              onClick={handleClear}
            >
          
          {showTodayButton && (
              varia
              onClick={handleToday}
            >
            <
        </div>
    </div>
}
















































































