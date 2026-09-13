"use client"

import * as React from "react"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"

import { cn } from "@nkps/shared/lib/utils"
import { Button } from "@nkps/shared/components/ui/button"
import { XIcon } from "lucide-react"

function Dialog({ ...props }: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogTrigger({ ...props }: DialogPrimitive.Trigger.Props) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal({ ...props }: DialogPrimitive.Portal.Props) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose({ ...props }: DialogPrimitive.Close.Props) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DialogOverlay({
  className,
  ...props
}: DialogPrimitive.Backdrop.Props) {
  return (
    <DialogPrimitive.Backdrop
      data-slot="dialog-overlay"
      className={cn(
        "fixed inset-0 isolate z-50 bg-navy-900/30 backdrop-blur-sm duration-200 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
        className
      )}
      {...props}
    />
  )
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  ...props
}: DialogPrimitive.Popup.Props & {
  showCloseButton?: boolean
}) {
  return (
    <DialogPortal>
      <DialogOverlay />
      {/* Below `sm` this is a bottom sheet; from `sm` up it is the centred
          dialog it has always been.
          A centred card on a phone is the desktop pattern shrunk: it lands in
          the middle of the screen, out of thumb reach, with its actions
          furthest from the hand. A sheet rises from the bottom edge, which is
          where the thumb already is, and is what every native control on the
          device does. Done here rather than at 93 call sites — and the
          `sm:max-w-*` those call sites pass still wins on desktop, because it
          is a different variant from the mobile rules below.

          The height cap matters either way: the popup is positioned with a
          translate, so a form taller than the viewport has nothing scrolling
          it and is unreachable at both ends. */}
      <DialogPrimitive.Popup
          data-slot="dialog-content"
          className={cn(
            // Shared
            "fixed z-50 grid overflow-y-auto overscroll-contain gap-5 bg-white dark:bg-card p-6 text-sm text-popover-foreground shadow-xl shadow-navy-900/10 ring-1 ring-navy-900/5 dark:ring-border duration-200 outline-none",
            // Mobile: a sheet pinned to the bottom edge, clearing the home
            // indicator, with only its top corners rounded.
            "inset-x-0 bottom-0 max-h-[88dvh] w-full max-w-none rounded-t-3xl pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))]",
            "data-open:animate-in data-open:fade-in-0 data-open:slide-in-from-bottom-full data-closed:animate-out data-closed:fade-out-0 data-closed:slide-out-to-bottom-full",
            // Desktop: back to the centred card.
            "sm:inset-x-auto sm:bottom-auto sm:top-1/2 sm:left-1/2 sm:max-h-[calc(100dvh-2rem)] sm:w-full sm:max-w-md sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:pb-6",
            "sm:data-open:zoom-in-95 sm:data-open:slide-in-from-bottom-2 sm:data-closed:zoom-out-95 sm:data-closed:slide-out-to-bottom-2",
            className
          )}
          {...props}
        >
          {/* Grab handle. Decorative — the sheet is dismissed by the backdrop,
              the close button or Escape — but it is the affordance that tells a
              phone user this is a sheet rather than a page. */}
          <div
            aria-hidden
            className="mx-auto -mt-3 mb-1 h-1 w-9 shrink-0 rounded-full bg-gray-300 dark:bg-white/20 sm:hidden"
          />
          {children}
          {showCloseButton && (
            <DialogPrimitive.Close
              data-slot="dialog-close"
              render={
                <Button
                  variant="ghost"
                  className="absolute top-4 right-4 text-gray-400 dark:text-gray-500 hover:text-navy-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-muted transition-colors"
                  size="icon-sm"
                />
              }
            >
              <XIcon />
              <span className="sr-only">Close</span>
            </DialogPrimitive.Close>
          )}
        </DialogPrimitive.Popup>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-1.5 pb-1", className)}
      {...props}
    />
  )
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean
}) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "-mx-6 -mb-6 flex flex-col-reverse gap-2 rounded-b-2xl border-t border-gray-100 dark:border-border bg-gray-50/80 dark:bg-muted/50 px-6 py-4 sm:flex-row sm:justify-end",
        className
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close render={<Button variant="outline" />}>
          Close
        </DialogPrimitive.Close>
      )}
    </div>
  )
}

function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn(
        "font-heading text-lg leading-tight font-semibold text-navy-900 dark:text-white",
        className
      )}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn(
        "text-sm text-gray-500 dark:text-gray-400 leading-relaxed *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground",
        className
      )}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
