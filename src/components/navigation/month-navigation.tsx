import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Calendar } from "lucide-react";
import { format, addMonths, subMonths, addYears, subYears, startOfMonth, endOfMonth } from "date-fns";

interface MonthNavigationProps {
  currentDate: Date;
  onDateChange: (date: Date) => void;
  showYearSelector?: boolean;
  viewMode?: "month" | "year";
}

export default function MonthNavigation({ 
  currentDate, 
  onDateChange, 
  showYearSelector = false,
  viewMode = "month"
}: MonthNavigationProps) {
  const handlePrevPeriod = () => {
    if (viewMode === "year") {
      onDateChange(subYears(currentDate, 1));
    } else {
      onDateChange(subMonths(currentDate, 1));
    }
  };

  const handleNextPeriod = () => {
    if (viewMode === "year") {
      onDateChange(addYears(currentDate, 1));
    } else {
      onDateChange(addMonths(currentDate, 1));
    }
  };

  const handleCurrentPeriod = () => {
    onDateChange(new Date());
  };

  const isCurrentPeriod = viewMode === "year" 
    ? format(currentDate, 'yyyy') === format(new Date(), 'yyyy')
    : format(currentDate, 'yyyy-MM') === format(new Date(), 'yyyy-MM');

  return (
    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-3 sm:gap-4">
      {/* Left Side - Arrows and Title */}
      <div className="flex items-center gap-3 sm:gap-4 w-full sm:w-auto">
        {/* Navigation Arrows */}
        <div className="flex items-center gap-1 sm:gap-2">
          <button 
            onClick={handlePrevPeriod}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors touch-manipulation"
            data-testid={`button-prev-${viewMode}`}
          >
            <ChevronLeft className="h-5 w-5 sm:h-6 sm:w-6 text-gray-600" />
          </button>
          <button 
            onClick={handleNextPeriod}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors touch-manipulation"
            data-testid={`button-next-${viewMode}`}
          >
            <ChevronRight className="h-5 w-5 sm:h-6 sm:w-6 text-gray-600" />
          </button>
        </div>
        
        {/* Month/Year Title */}
        <h1 className="text-2xl sm:text-3xl lg:text-4xl font-medium text-gray-900 text-left tracking-tight" data-testid="text-period-header">
          {viewMode === "year" 
            ? format(currentDate, 'yyyy')
            : format(currentDate, 'MMMM yyyy')
          }
        </h1>
      </div>

      {/* Right Side - Today button */}
      <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
        <button
          onClick={handleCurrentPeriod}
          className="px-4 py-2 bg-white hover:bg-gray-50 rounded-lg font-medium text-sm text-gray-600 hover:text-gray-800 transition-colors duration-200 shadow-sm touch-manipulation"
          data-testid={`button-current-${viewMode}`}
        >
          Today
        </button>
      </div>
    </div>
  );
}

export { startOfMonth, endOfMonth };