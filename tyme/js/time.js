(function (global) {
  'use strict';

  const partCache = new Map();

  function formatter(timeZone) {
    let fmt = partCache.get(timeZone);
    if (!fmt) {
      fmt = new Intl.DateTimeFormat('en-GB', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        weekday: 'short',
        hourCycle: 'h23',
        timeZoneName: 'short'
      });
      partCache.set(timeZone, fmt);
    }
    return fmt;
  }

  function parts(date, timeZone) {
    const bag = {};
    for (const entry of formatter(timeZone).formatToParts(date)) {
      if (entry.type !== 'literal') bag[entry.type] = entry.value;
    }
    return {
      year: Number(bag.year),
      month: Number(bag.month),
      day: Number(bag.day),
      hour: Number(bag.hour),
      minute: Number(bag.minute),
      second: Number(bag.second),
      weekday: bag.weekday,
      tzName: bag.timeZoneName || ''
    };
  }

  function offsetMs(date, timeZone) {
    const p = parts(date, timeZone);
    const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    return asUtc - date.getTime();
  }

  function zonedLocalToUtc(year, month, day, hour, minute, timeZone) {
    const localAsUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
    let instant = localAsUtc - offsetMs(new Date(localAsUtc), timeZone);
    instant = localAsUtc - offsetMs(new Date(instant), timeZone);
    return new Date(instant);
  }

  function startOfDay(date, timeZone) {
    const p = parts(date, timeZone);
    return zonedLocalToUtc(p.year, p.month, p.day, 0, 0, timeZone);
  }

  function addDays(date, days) {
    return new Date(date.getTime() + days * 86400000);
  }

  function sameCalendarDay(a, b) {
    return a.year === b.year && a.month === b.month && a.day === b.day;
  }

  function pad(value) {
    return String(value).padStart(2, '0');
  }

  function formatClock(hour, minute, hour12) {
    if (!hour12) return `${pad(hour)}:${pad(minute)}`;
    const suffix = hour >= 12 ? 'pm' : 'am';
    const h = hour % 12 || 12;
    return `${h}:${pad(minute)}${suffix}`;
  }

  /** Fixed-width 12h clock for dock alignment, e.g. "05:00 AM". */
  function formatDockClock(hour, minute) {
    const suffix = hour >= 12 ? 'PM' : 'AM';
    const h = hour % 12 || 12;
    return `${pad(h)}:${pad(minute)} ${suffix}`;
  }

  function formatDockRange(startHour, startMinute, endHour, endMinute) {
    return `${formatDockClock(startHour, startMinute)} – ${formatDockClock(endHour, endMinute)}`;
  }

  function formatHourLabel(hour, hour12) {
    if (!hour12) return { main: pad(hour), sub: '' };
    const suffix = hour >= 12 ? 'pm' : 'am';
    return { main: String(hour % 12 || 12), sub: suffix };
  }

  function formatDateShort(p) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${p.weekday}, ${months[p.month - 1]} ${p.day}`;
  }

  function formatDateChip(p) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return { weekday: p.weekday, month: months[p.month - 1], day: p.day };
  }

  function isoDate(p) {
    return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
  }

  function parseIsoDate(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '');
    if (!match) return null;
    return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
  }

  function hourBand(hour) {
    // Group 1 night 22–05 · Group 2 edge 06–07 & 18–21 · Group 3 day 08–17
    if (hour >= 22 || hour <= 5) return 'night';
    if (hour <= 7 || hour >= 18) return 'edge';
    return 'day';
  }

  function isWeekend(weekday) {
    return weekday === 'Sat' || weekday === 'Sun';
  }

  function inBusinessHours(hour) {
    return hour >= 9 && hour < 18;
  }

  function offsetHours(homeOffsetMs, cityOffsetMs) {
    return Math.round((cityOffsetMs - homeOffsetMs) / 3600000);
  }

  function formatOffset(hours) {
    if (hours === 0) return '±0';
    return hours > 0 ? `+${hours}` : `${hours}`;
  }

  function weekdayIndex(weekday) {
    const map = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    return map[weekday] ?? 0;
  }

  global.TymeTime = {
    parts,
    offsetMs,
    zonedLocalToUtc,
    startOfDay,
    addDays,
    sameCalendarDay,
    formatClock,
    formatDockClock,
    formatDockRange,
    formatHourLabel,
    formatDateShort,
    formatDateChip,
    isoDate,
    parseIsoDate,
    hourBand,
    isWeekend,
    inBusinessHours,
    offsetHours,
    formatOffset,
    weekdayIndex,
    pad
  };
})(window);
