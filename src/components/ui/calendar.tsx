"use client";

import * as React from "react";
import { DayPicker } from "react-day-picker";
import { it } from "react-day-picker/locale";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * react-day-picker 10 styled with the theme tokens only (Italian locale, week starts on Monday).
 * The selected day is `primary` on `primary-foreground`; today has a ring, not only a colour.
 */
function Calendar({ className, classNames, ...props }: React.ComponentProps<typeof DayPicker>) {
  return (
    <DayPicker
      locale={it}
      weekStartsOn={1}
      showOutsideDays
      className={cn("p-3", className)}
      classNames={{
        months: "flex flex-col gap-4",
        month: "flex flex-col gap-3",
        month_caption: "flex h-11 items-center justify-center font-semibold capitalize",
        nav: "absolute inset-x-3 top-3 flex items-center justify-between",
        button_previous:
          "inline-flex size-11 items-center justify-center rounded-md hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
        button_next:
          "inline-flex size-11 items-center justify-center rounded-md hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
        month_grid: "border-collapse",
        weekdays: "flex",
        weekday: "text-muted-foreground w-11 text-sm font-semibold capitalize",
        week: "mt-1 flex",
        day: "size-11 p-0 text-center",
        day_button:
          "size-11 rounded-md text-base tabular-nums hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring aria-selected:hover:bg-primary",
        selected:
          "[&>button]:bg-primary [&>button]:text-primary-foreground [&>button]:font-semibold",
        today: "[&>button]:ring-1 [&>button]:ring-foreground",
        outside: "text-muted-foreground",
        disabled: "text-muted-foreground opacity-50",
        hidden: "invisible",
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation }) =>
          orientation === "left" ? (
            <ChevronLeft aria-hidden className="size-5" />
          ) : (
            <ChevronRight aria-hidden className="size-5" />
          ),
      }}
      {...props}
    />
  );
}

export { Calendar };
