let requestSeq = 0;

function formatTime(date = new Date()) {
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  const s = String(date.getSeconds()).padStart(2, '0');
  const ms = String(date.getMilliseconds()).padStart(3, '0');
  return `${h}:${m}:${s}.${ms}`;
}

/**
 * Logs every API request to the terminal when the response finishes.
 * Use the sequence # and timestamp to see if the frontend fired multiple calls at once
 * (same second / close ms values = parallel burst when opening a dashboard screen).
 */
export function requestLogger(req, res, next) {
  if (req.method === 'OPTIONS') {
    next();
    return;
  }

  const seq = ++requestSeq;
  const startedAt = Date.now();
  const method = req.method;
  const path = req.originalUrl || req.url;

  res.on('finish', () => {
    const durationMs = Date.now() - startedAt;
    const tenant = req.user?.databaseName || '-';
    const email = req.user?.email || '-';
    const status = res.statusCode;
    const parts = [
      `[#${seq} ${formatTime(new Date(startedAt))}]`,
      `${method} ${path}`,
      `→ ${status}`,
      `${durationMs}ms`,
      `[tenant: ${tenant}]`,
    ];

    if (email !== '-') parts.push(`[user: ${email}]`);

    console.log(parts.join(' '));
  });

  next();
}
