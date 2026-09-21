import * as React from "react"
import { ChevronDownIcon } from "lucide-react"

import { cn } from "@nkps/shared/lib/utils"

// A native <select> wearing the same clothes as SelectTrigger.
//
// There are ~40 raw <select> elements in the ERP, each carrying its own
// hand-written `h-9 … text-sm` string. Every one of them was 36px tall (below
// the 44px touch minimum) and 14px (under the 16px threshold at which iOS
// zooms the viewport on focus and then will not zoom back out).
//
// These stay *native* rather than being converted to the base-ui Select:
// converting means restructuring value/onChange and every <option> into
// SelectItem children at 40 call sites, and a native select is the better
// control on a phone anyway — it opens the platform picker, which is a wheel
// your thumb already knows, instead of a popup listbox inside a scrolling
// sheet. The styling below is what makes it look like the rest of the form.
function NativeSelect({
  className,
  children,
  ...props
}: React.ComponentProps<"select">) {
  return (
    <div className="relative w-full min-w-0">
      <select
        data-slot="native-select"
        className={cn(
          // Matches Input's h-11 sm:h-8 / text-base md:text-sm exactly, so a
          // select and an input side by side line up.
          "h-11 w-full min-w-0 appearance-none rounded-lg border border-input bg-transparent py-1 pr-8 pl-2.5 text-base transition-colors outline-none",
          "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
          "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
          "aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20",
          "dark:bg-input/30 dark:hover:bg-input/50 dark:aria-invalid:border-destructive/50",
          "sm:h-8 md:text-sm",
          className
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDownIcon
        aria-hidden
        className="pointer-events-none absolute top-1/2 right-2 size-4 -translate-y-1/2 text-muted-foreground"
      />
    </div>
  )
}

export { NativeSelect }
