// Type definitions for Umami Analytics
interface UmamiTracker {
  track(eventName: string, eventData?: Record<string, any>): void;
}

interface Window {
  umami?: UmamiTracker;
}
