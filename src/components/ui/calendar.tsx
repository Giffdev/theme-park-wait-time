import { ComponentProps } from "react"
import { CaretLeft, CaretRight } from "@phosphor-icons/react"
import { DayPicker } from "react-day-picker"

import { cn } from "@/lib/utils"
import { buttonVariants } from "@/components/ui/button"
import { Button } from "@/components/ui/button"

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: ComponentProps<typeof DayPicker>) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-3", className)}
      classNames={{
        months: "flex flex-col sm:flex-row gap-4",
        month: "flex flex-col gap-4",
        caption: "flex justify-center pt-1 relative items-center mb-2",
        caption_label: "text-sm font-medium",
        nav: "flex items-center justify-center gap-2 order-1 mt-3",
        button_previous: cn(
          buttonVariants({ variant: "outline" }),
          "h-8 w-8 bg-transparent p-0"
        ),
        button_next: cn(
          buttonVariants({ variant: "outline" }),
          "h-8 w-8 bg-transparent p-0"
        ),
        month_caption: "flex justify-center items-center h-8 mb-2",
        months_dropdown: "flex gap-2",
        dropdown_root: "relative inline-block",
        dropdown: "absolute z-10",
        dropdowns: "flex gap-2 items-center",
        month_grid: "w-full border-collapse order-0",
        weekdays: "flex w-full",
        weekday: "text-muted-foreground rounded-md w-9 font-normal text-[0.8rem] h-9 flex items-center justify-center",
        week: "flex w-full mt-2",
        day_button: cn(
          buttonVariants({ variant: "ghost" }),
          "h-9 w-9 p-0 font-normal"
        ),
        day: "h-9 w-9 text-center text-sm p-0 relative flex items-center justify-center",
        selected:
          "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
        today: "bg-accent text-accent-foreground",
        outside:
          "text-muted-foreground opacity-50",
        disabled: "text-muted-foreground opacity-50",
        range_middle:
          "aria-selected:bg-accent aria-selected:text-accent-foreground",
        hidden: "invisible",
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation, ...props }) => {
          if (orientation === "left") {
            return <CaretLeft className="h-4 w-4" />
          }
          return <CaretRight className="h-4 w-4" />
        },
      }}
      {...props}
    />
  )
}

export { Calendar }
