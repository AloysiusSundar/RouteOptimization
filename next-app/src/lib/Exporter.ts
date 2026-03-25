import { ScheduleStop } from './ScheduleGenerator';

export function downloadCSV(schedule: ScheduleStop[]) {
  const headers = ['Place', 'Day', 'Date', 'Arrival', 'Departure', 'Lat', 'Lon'];
  const rows = schedule.map(stop => [
    `"${stop.place}"`,
    stop.day,
    stop.date,
    stop.time,
    stop.departure.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
    stop.latlon[0],
    stop.latlon[1]
  ]);

  const csvContent = [
    headers.join(','),
    ...rows.map(r => r.join(','))
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `TripItinerary_${new Date().toLocaleDateString('en-CA')}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
