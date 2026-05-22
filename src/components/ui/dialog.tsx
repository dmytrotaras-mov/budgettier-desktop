"use client"

import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { X } from "lucide-react"

import { cn } from "@/lib/utils"

const Dialog = DialogPrimitive.Root

const DialogTrigger = DialogPrimitive.Trigger

const DialogPortal = DialogPrimitive.Portal

const DialogClose = DialogPrimitive.Close

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className
    )}
    {...props}
  />
))
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => {
  const [touchStart, setTouchStart] = React.useState<number | null>(null);
  const [touchEnd, setTouchEnd] = React.useState<number | null>(null);
  const [translateY, setTranslateY] = React.useState(0);
  const contentRef = React.useRef<HTMLDivElement>(null);

  // Minimum swipe distance (in px) to trigger close
  const minSwipeDistance = 100;

  const onTouchStart = (e: React.TouchEvent) => {
    // Only enable swipe on mobile (screen width < 768px)
    if (window.innerWidth >= 768) return;

    // Check if touch started on an element with data-prevent-dialog-swipe
    const target = e.target as HTMLElement;
    if (target.closest('[data-prevent-dialog-swipe]')) {
      return;
    }

    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientY);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (window.innerWidth >= 768 || touchStart === null) return;

    const currentTouch = e.targetTouches[0].clientY;
    const distance = currentTouch - touchStart;

    // Only allow downward swipe
    if (distance > 0) {
      setTranslateY(distance);
      setTouchEnd(currentTouch);
    }
  };

  const onTouchEnd = () => {
    if (window.innerWidth >= 768 || touchStart === null || touchEnd === null) {
      setTranslateY(0);
      return;
    }

    const distance = touchEnd - touchStart;
    const isDownSwipe = distance > minSwipeDistance;

    if (isDownSwipe) {
      // Trigger close by finding and clicking the close button
      const closeButton = contentRef.current?.querySelector('[data-dialog-close]') as HTMLButtonElement;
      if (closeButton) {
        closeButton.click();
      }
    }

    setTranslateY(0);
    setTouchStart(null);
    setTouchEnd(null);
  };

  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={contentRef}
        className={cn(
          // Base styles
          "fixed z-50 border bg-background shadow-lg duration-200",
          "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
          // Desktop/Tablet: centered modal with auto height
          "md:left-[50%] md:top-[50%] md:translate-x-[-50%] md:translate-y-[-50%] md:rounded-2xl md:grid md:gap-4",
          "md:max-w-lg md:rounded-lg md:p-8 md:max-h-[90vh] md:h-auto md:w-full",
          "md:data-[state=closed]:zoom-out-95 md:data-[state=open]:zoom-in-95",
          // Mobile: full-screen bottom sheet with safe areas (covers entire viewport)
          "max-md:inset-0 max-md:w-screen max-md:h-[100dvh] max-md:rounded-t-3xl max-md:rounded-b-none",
          "max-md:flex max-md:flex-col max-md:overflow-hidden",
          className
        )}
        style={{
          transition: touchStart !== null && touchEnd !== null ? 'none' : 'transform 200ms',
          maxHeight: window.innerWidth >= 768 ? 'min(90vh, 900px)' : '100dvh'
        }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        {...props}
      >
        {/* Mobile drag handle */}
        <div className="flex md:hidden justify-center pt-3 pb-2 px-6 bg-background rounded-t-3xl flex-shrink-0">
          <div className="w-10 h-1 bg-gray-300 rounded-full"></div>
        </div>

        {/* Content wrapper - allows children to control their own layout */}
        <div className="flex-1 flex flex-col md:contents overflow-hidden">
          {children}
        </div>

        <DialogPrimitive.Close
          data-dialog-close
          className="hidden"
          style={{
            width: '48px',
            height: '48px',
            minWidth: '48px',
            minHeight: '48px',
            backgroundColor: '#fff',
            border: '1px solid #F3F4F6',
            borderRadius: '30px',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer'
          }}
        >
          <X style={{ width: '18px', height: '18px', color: '#000' }} />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPortal>
  );
})
DialogContent.displayName = DialogPrimitive.Content.displayName

const DialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col text-center sm:text-left",
      className
    )}
    {...props}
  />
)
DialogHeader.displayName = "DialogHeader"

const DialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2",
      className
    )}
    {...props}
  />
)
DialogFooter.displayName = "DialogFooter"

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn(
      "text-lg font-semibold leading-none tracking-tight",
      className
    )}
    {...props}
  />
))
DialogTitle.displayName = DialogPrimitive.Title.displayName

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
))
DialogDescription.displayName = DialogPrimitive.Description.displayName

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
}
