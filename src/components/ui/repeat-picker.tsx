import * as React from "react";
import { useState } from "react";
import { RefreshCw, Calendar, Clock, Settings } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export interface RepeatConfig {
  type: 'never' | 'daily' | 'weekly' | 'monthly' | 'custom';
  frequency?: number; // for custom: every X days/weeks/months
  interval?: 'days' | 'weeks' | 'months'; // for custom
  dayOfMonth?: number; // for monthly custom (specific day)
}

interface RepeatPickerProps {
  repeatConfig?: RepeatConfig;
  onRepeatChange: (config: RepeatConfig | undefined) => void;
  className?: string;
  disabled?: boolean;
}

export function RepeatPicker({ 
  repeatConfig, 
  onRepeatChange, 
  className,
  disabled 
}: RepeatPickerProps) {
  const [isRepeatPopoverOpen, setIsRepeatPopoverOpen] = useState(false);
  const [customFrequency, setCustomFrequency] = useState(2);
  const [customInterval, setCustomInterval] = useState<'days' | 'weeks' | 'months'>('weeks');
  const [customDayOfMonth, setCustomDayOfMonth] = useState(1);

  const getRepeatLabel = (config?: RepeatConfig) => {
    if (!config || config.type === 'never') return "Never repeat";
    if (config.type === 'daily') return "Every day";
    if (config.type === 'weekly') return "Every week";
    if (config.type === 'monthly') return "Every month";
    if (config.type === 'custom') {
      if (config.interval === 'days' && config.frequency === 1) return "Every day";
      if (config.interval === 'weeks' && config.frequency === 1) return "Every week";
      if (config.interval === 'months' && config.frequency === 1) return "Every month";
      return `Every ${config.frequency} ${config.interval}`;
    }
    return "Never repeat";
  };

  const handleRepeatSelect = (type: RepeatConfig['type']) => {
    if (type === 'never') {
      onRepeatChange(undefined);
      setIsRepeatPopoverOpen(false);
    } else {
      onRepeatChange({ type });
      setIsRepeatPopoverOpen(false);
    }
  };

  const handleCustomSubmit = () => {
    const config: RepeatConfig = {
      type: 'custom',
      frequency: customFrequency,
      interval: customInterval,
    };

    if (customInterval === 'months' && customDayOfMonth) {
      config.dayOfMonth = customDayOfMonth;
    }

    onRepeatChange(config);
    setIsRepeatPopoverOpen(false);
  };

  return (
    <div className={cn("", className)}>
      {/* Single Button that opens repeat options */}
      <Popover open={isRepeatPopoverOpen} onOpenChange={setIsRepeatPopoverOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            className="w-full h-14 md:h-12 text-base font-normal border-0 bg-gray-50 hover:bg-gray-100 text-gray-700 flex items-center gap-3 px-3 rounded-xl transition-all justify-start"
            disabled={disabled}
          >
            <RefreshCw className="h-5 w-5" />
            <span>{getRepeatLabel(repeatConfig)}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-4" side="bottom" align="start" sideOffset={4}>
          <div className="space-y-4">
            {/* Quick Repeat Options */}
            <div className="space-y-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={`w-full h-8 text-xs font-medium border-gray-200 hover:bg-gray-50 justify-start ${
                  (!repeatConfig || repeatConfig.type === 'never') ? 'bg-gray-50 border-gray-300' : ''
                }`}
                onClick={() => handleRepeatSelect('never')}
              >
                <RefreshCw className="mr-2 h-3 w-3" />
                Never
              </Button>
              
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={`w-full h-8 text-xs font-medium border-gray-200 hover:bg-gray-50 justify-start ${
                  repeatConfig?.type === 'daily' ? 'bg-gray-50 border-gray-300' : ''
                }`}
                onClick={() => handleRepeatSelect('daily')}
              >
                <Clock className="mr-2 h-3 w-3" />
                Daily
              </Button>
              
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={`w-full h-8 text-xs font-medium border-gray-200 hover:bg-gray-50 justify-start ${
                  repeatConfig?.type === 'weekly' ? 'bg-gray-50 border-gray-300' : ''
                }`}
                onClick={() => handleRepeatSelect('weekly')}
              >
                <Calendar className="mr-2 h-3 w-3" />
                Weekly
              </Button>
              
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={`w-full h-8 text-xs font-medium border-gray-200 hover:bg-gray-50 justify-start ${
                  repeatConfig?.type === 'monthly' ? 'bg-gray-50 border-gray-300' : ''
                }`}
                onClick={() => handleRepeatSelect('monthly')}
              >
                <Calendar className="mr-2 h-3 w-3" />
                Monthly
              </Button>
            </div>

            {/* Custom Section */}
            <div className="border-t pt-3">
              <div className="flex items-center gap-2 mb-3">
                <Settings className="h-4 w-4 text-gray-600" />
                <h4 className="font-medium text-sm text-gray-900">Custom</h4>
              </div>
              
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs text-gray-600">Every</Label>
                    <Input
                      type="number"
                      min="1"
                      max="31"
                      value={customFrequency}
                      onChange={(e) => setCustomFrequency(parseInt(e.target.value) || 1)}
                      className="h-8 text-sm"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                        }
                      }}
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-gray-600">Period</Label>
                    <Select value={customInterval} onValueChange={(value: 'days' | 'weeks' | 'months') => setCustomInterval(value)}>
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="days">Days</SelectItem>
                        <SelectItem value="weeks">Weeks</SelectItem>
                        <SelectItem value="months">Months</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {customInterval === 'months' && (
                  <div>
                    <Label className="text-xs text-gray-600">On day of month</Label>
                    <Input
                      type="number"
                      min="1"
                      max="31"
                      value={customDayOfMonth}
                      onChange={(e) => setCustomDayOfMonth(parseInt(e.target.value) || 1)}
                      className="h-8 text-sm"
                      placeholder="1-31"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                        }
                      }}
                    />
                  </div>
                )}

                <Button
                  type="button"
                  size="sm"
                  onClick={handleCustomSubmit}
                  className="w-full h-8 text-xs"
                >
                  Apply Custom Schedule
                </Button>
              </div>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}