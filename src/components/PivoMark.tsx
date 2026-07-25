/**
 * סמל PIVO — ספירלה פותחת. מקור: לוח המיתוג, רכיב "Spiral".
 * הצבע נשלט מבחוץ דרך currentColor כדי שיתאים לערכה הבהירה והכהה.
 */
export function PivoMark({ size = 28, stroke = 8.5 }: { size?: number; stroke?: number }) {
  return (
    <svg
      className="brand-mark"
      viewBox="0 0 100 100"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M14 50 A36 36 0 0 1 86 50 A28 28 0 0 1 30 50 A20 20 0 0 1 70 50 A12 12 0 0 1 46 50"
        fill="none"
        stroke="currentColor"
        strokeWidth={stroke}
        strokeLinecap="round"
      />
    </svg>
  );
}
