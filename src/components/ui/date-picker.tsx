import * as React from "react"
import { format } from "date-fns"
import { Calendar as CalendarIcon } from "lucide-react"

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
  onDateChange: (date: Date | undefined) => void
  placeholder?: string
  className?: string
  disabled?: boolean
}

export function DatePicker({ 
  date, 
  onDateChange, 
  placeholder = "Pick a date",
  className,
  disabled 
}: DatePickerProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant={"outline"}
          className={cn(
            "h-8 text-sm border-gray-200 focus:border-gray-400 justify-start text-left font-normal",
            !date && "text-muted-foreground",
            className
          )}
          disabled={disabled}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {date ? format(date, "PPP") : <span>{placeholder}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0 bg-white shadow-lg border" align="start">
        {/* Optimized calendar - 30% smaller with better button functionality */}
        <div className="p-3">
          <Calendar
            mode="single"
            selected={date}
            onSelect={onDateChange}
            initialFocus
            className="p-2"
            classNames={{
              months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0",
              month: "space-y-3",
              caption: "flex justify-center pt-1 relative items-center mb-3",
              caption_label: "text-lg font-semibold",
              nav: "space-x-1 flex items-center",
              nav_button: "h-8 w-8 bg-transparent p-0 opacity-60 hover:opacity-100 border border-gray-300 rounded hover:bg-gray-50 flex items-center justify-center",
              nav_button_previous: "absolute left-1",
              nav_button_next: "absolute right-1",
              table: "w-full border-collapse space-y-1",
              head_row: "flex",
              head_cell: "text-gray-600 rounded w-8 font-medium text-sm text-center py-1",
              row: "flex w-full mt-1",
              cell: "h-8 w-8 text-center text-sm p-0 relative rounded",
              day: "h-8 w-8 p-0 font-normal rounded hover:bg-gray-100 focus:bg-gray-100 text-sm flex items-center justify-center cursor-pointer transition-colors",
              day_selected: "bg-gray-900 text-white hover:bg-gray-800 hover:text-white focus:bg-gray-800 focus:text-white",
              day_today: "bg-gray-100 text-gray-900 font-semibold",
              day_outside: "text-gray-400 hover:bg-gray-50",
              day_disabled: "text-gray-300 opacity-50 cursor-not-allowed",
              day_hidden: "invisible",
            }}
          />
        </div>
      </PopoverContent>
    </Popover>
  )
}