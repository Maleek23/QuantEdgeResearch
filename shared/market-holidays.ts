/**
 * NYSE full-day closures, 2026–2027 (NYSE published schedule). The Path and
 * Envelope engines skip these sessions; early closes (13:00 ET) are NOT
 * modelled — they are treated as full sessions. Extend the table yearly;
 * past the last listed year `isNyseHoliday` returns false (weekdays trade).
 */
export const NYSE_HOLIDAYS: Readonly<Record<string, string>> = {
  '2026-01-01': "New Year's Day",
  '2026-01-19': 'Martin Luther King Jr. Day',
  '2026-02-16': "Washington's Birthday",
  '2026-04-03': 'Good Friday',
  '2026-05-25': 'Memorial Day',
  '2026-06-19': 'Juneteenth',
  '2026-07-03': 'Independence Day (observed)',
  '2026-09-07': 'Labor Day',
  '2026-11-26': 'Thanksgiving Day',
  '2026-12-25': 'Christmas Day',
  '2027-01-01': "New Year's Day",
  '2027-01-18': 'Martin Luther King Jr. Day',
  '2027-02-15': "Washington's Birthday",
  '2027-03-26': 'Good Friday',
  '2027-05-31': 'Memorial Day',
  '2027-06-18': 'Juneteenth (observed)',
  '2027-07-05': 'Independence Day (observed)',
  '2027-09-06': 'Labor Day',
  '2027-11-25': 'Thanksgiving Day',
  '2027-12-24': 'Christmas Day (observed)',
};
export const NYSE_HOLIDAYS_THROUGH = '2027-12-31';
export const isNyseHoliday = (isoDate: string): boolean => Object.prototype.hasOwnProperty.call(NYSE_HOLIDAYS, isoDate);
