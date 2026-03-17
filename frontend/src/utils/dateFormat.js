/**
 * Format date as DD-Mon-YY (e.g. 13-Mar-26) for display across the app.
 * @param {string|Date} value - YYYY-MM-DD, YYYY-MM, or Date object
 * @returns {string} DD-Mon-YY or original value if invalid
 */
export function formatDateDDMonYY(value) {
  if (value == null || value === '') return value ?? '';
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  let y, m, d;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return String(value);
    y = value.getFullYear();
    m = value.getMonth();
    d = value.getDate();
  } else {
    const s = String(value).trim();
    if (s.length >= 10 && /^\d{4}-\d{2}-\d{2}/.test(s)) {
      const parts = s.slice(0, 10).split('-');
      y = parseInt(parts[0], 10);
      m = parseInt(parts[1], 10) - 1;
      d = parseInt(parts[2], 10);
    } else if (s.length >= 7 && /^\d{4}-\d{2}/.test(s)) {
      const parts = s.slice(0, 7).split('-');
      y = parseInt(parts[0], 10);
      m = parseInt(parts[1], 10) - 1;
      d = 1;
    } else {
      return s;
    }
  }
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 0 || m > 11 || !Number.isFinite(d)) return String(value);
  const day = String(d).padStart(2, '0');
  const mon = MONTHS[m];
  const yy = String(y).slice(-2);
  return `${day}-${mon}-${yy}`;
}
