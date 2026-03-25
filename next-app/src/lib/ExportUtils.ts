import { ScheduleStop } from './ScheduleGenerator';

/**
 * Generates and triggers a CSV download for the trip itinerary.
 */
export function exportToCsv(schedule: ScheduleStop[]) {
  if (!schedule || schedule.length === 0) return;

  const headers = ['Date', 'Arrival', 'Stop Name', 'Departure', 'Duration (mins)', 'Type'];
  const rows = schedule.map(s => {
    const duration = Math.round((s.departure.getTime() - s.arrival.getTime()) / 60000);
    const depTime = s.departure.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
    return [
      s.date,
      s.time,
      `"${s.place.replace(/"/g, '""')}"`,
      depTime,
      duration,
      s.isReservation ? 'Reservation' : 'Sightseeing'
    ];
  });

  const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
// ... rest of CSV logic ...
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `itinerary_${schedule[0].date}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Generates and triggers an iCal (ICS) download for the trip itinerary.
 */
export function exportToIcal(schedule: ScheduleStop[]) {
  if (!schedule || schedule.length === 0) return;

  let icsContent = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//RouteOptimizer//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH'
  ].join('\r\n');

  const now = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

  schedule.forEach((s, i) => {
    // Format: YYYYMMDDTHHMMSS
    const startStr = s.date.replace(/-/g, '') + 'T' + s.time.replace(/:/g, '') + '00';
    const depTime = s.departure.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
    const endStr = s.date.replace(/-/g, '') + 'T' + depTime.replace(/:/g, '') + '00';
    const duration = Math.round((s.departure.getTime() - s.arrival.getTime()) / 60000);
    
    icsContent += '\r\n' + [
      'BEGIN:VEVENT',
      `UID:route-opt-${Date.now()}-${i}@app.com`,
      `DTSTAMP:${now}`,
      `DTSTART:${startStr}`, 
      `DTEND:${endStr}`,
      `SUMMARY:${s.place}`,
      `DESCRIPTION:Day visit to ${s.place}. Planned duration: ${duration} minutes.`,
      'END:VEVENT'
    ].join('\r\n');
  });

  icsContent += '\r\nEND:VCALENDAR';
  const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `itinerary_${schedule[0].date}.ics`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
