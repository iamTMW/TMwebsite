/** Email templates for visit notifications. Every dynamic value is escaped. */

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function stamp(now, timeZone) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
  }).format(now);
}

function layout(title, rows, footer) {
  const body = rows.map(([k, v]) => `
        <tr>
          <td style="padding:8px 16px 8px 0;color:#6b6156;font-size:13px;white-space:nowrap;vertical-align:top">${escapeHtml(k)}</td>
          <td style="padding:8px 0;color:#1b1712;font-size:14px">${escapeHtml(v)}</td>
        </tr>`).join('');
  return `<!doctype html><html><body style="margin:0;background:#faf7f2;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#fff;border:1px solid #e2d9cb;border-radius:12px;padding:24px">
        <tr><td>
          <p style="margin:0 0 4px;color:#9a5806;font-size:12px;letter-spacing:.08em;text-transform:uppercase">tahamohyuddin.com</p>
          <h1 style="margin:0 0 16px;font-size:20px;color:#1b1712;font-weight:600">${escapeHtml(title)}</h1>
          <table role="presentation" cellpadding="0" cellspacing="0">${body}
          </table>
          <p style="margin:20px 0 0;color:#6b6156;font-size:12px;line-height:1.5">${escapeHtml(footer)}</p>
        </td></tr>
      </table>
    </td></tr>
  </table></body></html>`;
}

export function renderVisitEmail({ now, timeZone, path, referrer, device, suppressed }) {
  const when = stamp(now, timeZone);
  const source = referrer || 'Direct or unknown';
  const rows = [
    ['Time', when],
    ['First page', path],
    ['Came from', source],
    ['Device', device],
  ];
  if (suppressed > 0) rows.push(['Also today', `${suppressed} more visit${suppressed === 1 ? '' : 's'} while alerts were paused`]);
  const footer = 'One alert per new browser session. This does not identify the visitor. Turn alerts off with VISIT_NOTIFY_ENABLED=false.';
  const text = [
    'New portfolio visit',
    ...rows.map(([k, v]) => `${k}: ${v}`),
    '',
    footer,
  ].join('\n');
  return {
    subject: `New portfolio visit: ${path}${referrer ? ` via ${referrer}` : ''}`.slice(0, 140),
    html: layout('Someone is looking at your portfolio', rows, footer),
    text,
  };
}

export function renderCapEmail({ now, timeZone, perHour, perDay }) {
  const rows = [
    ['Time', stamp(now, timeZone)],
    ['Limits', `${perHour} per hour, ${perDay} per day`],
  ];
  const footer = 'Further visits are being counted, not emailed. The count will appear in the next alert after the limit resets. If this is unexpected, it may be automated traffic.';
  return {
    subject: 'Portfolio visit alerts paused (volume limit reached)',
    html: layout('Visit alerts paused for now', rows, footer),
    text: ['Visit alerts paused for now', ...rows.map(([k, v]) => `${k}: ${v}`), '', footer].join('\n'),
  };
}
