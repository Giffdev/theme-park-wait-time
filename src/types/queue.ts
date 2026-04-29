/** Virtual queue data shapes from ThemeParks Wiki API */

export interface ReturnTimeQueue {
  state: 'AVAILABLE' | 'TEMPORARILY_FULL' | 'FINISHED';
  returnStart: string | null;
  returnEnd: string | null;
}

export interface PaidReturnTimeQueue {
  state: 'AVAILABLE' | 'TEMPORARILY_FULL' | 'FINISHED';
  returnStart: string | null;
  returnEnd: string | null;
  price: { amount: number; currency: string; formatted: string } | null;
}

export interface BoardingGroupQueue {
  state: 'AVAILABLE' | 'PAUSED' | 'CLOSED';
  currentGroupStart: number | null;
  currentGroupEnd: number | null;
  estimatedWait: number | null;
}

export interface QueueData {
  RETURN_TIME?: ReturnTimeQueue;
  PAID_RETURN_TIME?: PaidReturnTimeQueue;
  BOARDING_GROUP?: BoardingGroupQueue;
}

export interface ForecastEntry {
  time: string;
  waitTime: number;
  percentage: number;
}

export interface OperatingHoursEntry {
  type: string;
  startTime: string;
  endTime: string;
}

export interface ScheduleSegment {
  type: string;
  description: string | null;
  openingTime: string;
  closingTime: string;
  purchases?: Array<{
    name: string;
    type?: string;
    price: { amount: number; currency: string; formatted: string };
    available: boolean;
  }>;
}
