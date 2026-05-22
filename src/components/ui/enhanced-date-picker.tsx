import * as React from "react";
import { useState } from "react";
import { format, addDays, subDays, isToday, isYesterday, isTomorrow } from "date-fns";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface EnhancedDatePickerProps {
  date?: Date;
  onDateChange: (date: Date | undefined) => void;
  className?: string;
  disabled?: boolean;
}

export function EnhancedDatePicker({ 
  date, 
  onDateChange, 
  className,
  disabled 
}: EnhancedDatePickerProps) {
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);

  const currentDate = date || new Date();

  const getDateLabel = (selectedDate: Date) => {
    if (isToday(selectedDate)) return "Today";
    if (isYesterday(selectedDate)) return "Yesterday";
    if (isTomorrow(selectedDate)) return "Tomorrow";
    return format(selectedDate, "MMMM do, yyyy");
  };

  const handlePreviousDay = () => {
    const newDate = subDays(currentDate, 1);
    onDateChange(newDate);
  };

  const handleNextDay = () => {
    const newDate = addDays(currentDate, 1);
    onDateChange(newDate);
  };

  const handleQuickDate = (type: 'today' | 'yesterday' | 'tomorrow') => {
    const today = new Date();
    let newDate: Date;
    
    switch (type) {
      case 'today':
        newDate = today;
        break;
      case 'yesterday':
        newDate = subDays(today, 1);
        break;
      case 'tomorrow':
        newDate = addDays(today, 1);
        break;
    }
    
    onDateChange(newDate);
  };

  return (
    <div className={cn("", className)}>
      {/* Clean Date Display with Navigation Arrows */}
      <div className="flex items-center justify-between border-0 rounded-xl px-3 py-0 bg-gray-50 hover:bg-gray-100 h-14 md:h-12 transition-all">
        <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              className="h-auto p-0 hover:bg-transparent flex items-center gap-3 text-left justify-start flex-1 text-gray-700 min-w-0 font-normal"
              disabled={disabled}
            >
              <CalendarIcon className="h-5 w-5 flex-shrink-0 text-gray-700" />
              <span className="text-base font-normal truncate">
                {getDateLabel(currentDate)}
              </span>
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[280px] p-0 bg-white shadow-lg border" align="start">
            <div className="p-3">
              <Calendar
                mode="single"
                selected={currentDate}
                onSelect={(selectedDate) => {
                  if (selectedDate) {
                    onDateChange(selectedDate);
                    setIsCalendarOpen(false);
                  }
                }}
                initialFocus
                fixedWeeks={true}
                showOutsideDays={true}
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

        {/* Navigation arrows positioned next to each other */}
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 hover:bg-gray-200 rounded text-gray-600"
            onClick={handlePreviousDay}
            disabled={disabled}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 hover:bg-gray-200 rounded text-gray-600"
            onClick={handleNextDay}
            disabled={disabled}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}