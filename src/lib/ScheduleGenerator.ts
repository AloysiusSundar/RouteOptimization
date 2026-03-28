export interface Place {
  id: string;
  name: string;
  reservation_time?: Date | null;
  visit_duration: number; // in minutes
  forcedDate?: string; // YYYY-MM-DD
}

export interface ScheduleStop {
  id: string;
  place: string;
  latlon: [number, number];
  arrival: Date;
  departure: Date;
  day: string;
  date: string;
  time: string;
  isReservation?: boolean;
  travelMinutes?: number;
  trafficDelayMinutes?: number;
  historicalMinutes?: number;
}

export interface ActiveHours {
  start: { hours: number; minutes: number };
  end: { hours: number; minutes: number };
}

export function generateSchedule(
  places: Place[],
  coords: [number, number][],
  order: number[],
  startDate: Date,
  activeHours: Record<string, ActiveHours>,
  durationsMatrix: number[][], // Traffic-aware (primary)
  baseDurationsMatrix?: number[][], // Free-flow (Ideal)
  historicalDurationsMatrix?: number[][] // Usual (Historical)
): ScheduleStop[] {
  const schedule: ScheduleStop[] = [];

  // Helper to get active hours for a specific Date
  const getActiveHoursForDate = (d: Date) => {
    const defaultHours = { start: { hours: 8, minutes: 0 }, end: { hours: 20, minutes: 0 } };
    const dateStr = d.toISOString().split('T')[0];
    return activeHours[dateStr] || defaultHours;
  };

  // Convert Date and ActiveHours.start to a specific Date object
  const setTimeOnDate = (d: Date, hours: number, minutes: number) => {
    const newDate = new Date(d);
    newDate.setHours(hours, minutes, 0, 0);
    return newDate;
  };

  let currentDay = new Date(startDate);
  let activeH = getActiveHoursForDate(currentDay);
  let currentTime = setTimeOnDate(currentDay, activeH.start.hours, activeH.start.minutes);

  for (let i = 0; i < order.length; i++) {
    const idx = order[i];
    const place = places[idx];
    const coord = coords[idx];

    // Forced Date Alignment (V4.7 Fix)
    // If this stop belongs to a specific day, ensure we don't start it on an earlier day
    if (place.forcedDate) {
      const targetDate = new Date(place.forcedDate + "T00:00:00");
      const currentOnlyDate = new Date(currentTime);
      currentOnlyDate.setHours(0,0,0,0);

      if (currentOnlyDate < targetDate) {
        const nextDayH = getActiveHoursForDate(targetDate);
        currentTime = setTimeOnDate(targetDate, nextDayH.start.hours, nextDayH.start.minutes);
      }
    }

    let arrivalTime = new Date(currentTime);

    if (i > 0) {
      const prevIdx = order[i - 1];
      const travelMinutes = durationsMatrix[prevIdx][idx];
      arrivalTime.setMinutes(arrivalTime.getMinutes() + travelMinutes);
    }

    let dayStart = setTimeOnDate(arrivalTime, getActiveHoursForDate(arrivalTime).start.hours, getActiveHoursForDate(arrivalTime).start.minutes);
    let dayEnd = setTimeOnDate(arrivalTime, getActiveHoursForDate(arrivalTime).end.hours, getActiveHoursForDate(arrivalTime).end.minutes);

    if (dayEnd <= dayStart) {
      dayEnd.setDate(dayEnd.getDate() + 1);
    }

    if (arrivalTime < dayStart) {
      arrivalTime = new Date(dayStart);
    }

    // Check if we bumped into the end of the day before we even arrived
    if (arrivalTime > dayEnd) {
      // push to next day
      arrivalTime.setDate(arrivalTime.getDate() + 1);
      const nextDayParams = getActiveHoursForDate(arrivalTime);
      arrivalTime = setTimeOnDate(arrivalTime, nextDayParams.start.hours, nextDayParams.start.minutes);
      
      dayStart = setTimeOnDate(arrivalTime, nextDayParams.start.hours, nextDayParams.start.minutes);
      dayEnd = setTimeOnDate(arrivalTime, nextDayParams.end.hours, nextDayParams.end.minutes);
      if (dayEnd <= dayStart) dayEnd.setDate(dayEnd.getDate() + 1);
    }

    const reservation = place.reservation_time;
    if (reservation && arrivalTime < reservation) {
      arrivalTime = new Date(reservation);
      
      // We might have jumped a day ahead due to reservation, update day bounds
      dayStart = setTimeOnDate(arrivalTime, getActiveHoursForDate(arrivalTime).start.hours, getActiveHoursForDate(arrivalTime).start.minutes);
      dayEnd = setTimeOnDate(arrivalTime, getActiveHoursForDate(arrivalTime).end.hours, getActiveHoursForDate(arrivalTime).end.minutes);
      if (dayEnd <= dayStart) dayEnd.setDate(dayEnd.getDate() + 1);
    }

    const visitStart = new Date(arrivalTime);
    const visitEnd = new Date(visitStart);
    visitEnd.setMinutes(visitEnd.getMinutes() + place.visit_duration);

    // If the visit pushes us past the end of the day, do the visit tomorrow instead
    if (visitEnd > dayEnd) {
      arrivalTime.setDate(arrivalTime.getDate() + 1);
      const nextDayParams = getActiveHoursForDate(arrivalTime);
      const nextStart = setTimeOnDate(arrivalTime, nextDayParams.start.hours, nextDayParams.start.minutes);
      
      arrivalTime = new Date(nextStart);
      visitEnd.setTime(nextStart.getTime() + place.visit_duration * 60000);
    }

    currentTime = new Date(visitEnd);

    schedule.push({
      id: place.id || `stop-${i}-${Date.now()}`,
      place: place.name,
      latlon: coord,
      arrival: new Date(arrivalTime),
      departure: new Date(visitEnd),
      day: arrivalTime.toLocaleDateString('en-US', { weekday: 'long' }),
      date: arrivalTime.toLocaleDateString('en-CA'),
      time: arrivalTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
      isReservation: !!place.reservation_time,
      travelMinutes: i > 0 ? durationsMatrix[order[i-1]][idx] : 0,
      trafficDelayMinutes: (i > 0 && baseDurationsMatrix) 
        ? Math.max(0, durationsMatrix[order[i-1]][idx] - baseDurationsMatrix[order[i-1]][idx]) 
        : 0,
      historicalMinutes: (i > 0 && historicalDurationsMatrix && historicalDurationsMatrix[order[i-1]][idx] > 0) 
        ? historicalDurationsMatrix[order[i-1]][idx] 
        : (i > 0 ? durationsMatrix[order[i-1]][idx] : 0)
    });
  }

  return schedule;
}
