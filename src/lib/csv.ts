export function csvCell(value: unknown) {
  const text = String(value ?? "");
  // Prevent spreadsheet formula execution while retaining the cell text.
  const safeText = /^[\t\r\n ]*[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safeText.replaceAll('"', '""')}"`;
}
