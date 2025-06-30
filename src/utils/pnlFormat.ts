export function formatPnl(value: string | number): string {
  const numValue = typeof value === "string" ? parseFloat(value) : value;
  const sign = numValue > 0 ? "+" : "";

  // Format with appropriate decimal places based on magnitude
  let formatted: string;
  if (typeof value === "string" && !isNaN(parseFloat(value))) {
    // For string values, parse and format consistently
    const num = parseFloat(value);
    if (Math.abs(num) >= 100) {
      formatted = num.toFixed(1);
    } else if (Math.abs(num) >= 10) {
      formatted = num.toFixed(1);
    } else {
      formatted = num.toFixed(2);
    }
  } else if (typeof value === "number") {
    if (Math.abs(value) >= 100) {
      formatted = value.toFixed(1);
    } else if (Math.abs(value) >= 10) {
      formatted = value.toFixed(1);
    } else {
      formatted = value.toFixed(2);
    }
  } else {
    formatted = String(value); // Fallback
  }

  return `${sign}${formatted}`;
}
