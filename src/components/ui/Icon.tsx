/**
 * ערכת אייקונים · אפיון §3.16.
 * SVG פנימי, קו 1.5, currentColor, ללא ספריית אייקונים וללא אימוג'י.
 * האייקון תמיד aria-hidden — המשמעות יושבת בטקסט שלידו או ב-aria-label של הכפתור.
 */
import { SVGProps } from 'react';

export type IconName =
  | 'close' | 'chevron-down' | 'chevron-start' | 'check' | 'plus'
  | 'search' | 'edit' | 'external' | 'drag' | 'moon' | 'phone'
  | 'building' | 'book' | 'logout';

const PATHS: Record<IconName, JSX.Element> = {
  'close': <path d="M4 4l8 8M12 4l-8 8" />,
  'chevron-down': <path d="M4 6.5l4 4 4-4" />,
  'chevron-start': <path d="M10 3.5l-4 4.5 4 4.5" />,
  'check': <path d="M3.5 8.5l3 3 6-7" />,
  'plus': <path d="M8 3.5v9M3.5 8h9" />,
  'search': <g><circle cx="7.3" cy="7.3" r="3.8" /><path d="M10.2 10.2l3 3" /></g>,
  'edit': <g><path d="M11.2 2.9l1.9 1.9-7.4 7.4-2.5.6.6-2.5z" /><path d="M9.9 4.2l1.9 1.9" /></g>,
  'external': <g><path d="M9 3.5h3.5V7" /><path d="M12.5 3.5L7.8 8.2" /><path d="M11 9.5v3h-8v-8h3" /></g>,
  'drag': <g fill="currentColor" stroke="none">
    <circle cx="6" cy="4" r="1.1" /><circle cx="10" cy="4" r="1.1" />
    <circle cx="6" cy="8" r="1.1" /><circle cx="10" cy="8" r="1.1" />
    <circle cx="6" cy="12" r="1.1" /><circle cx="10" cy="12" r="1.1" />
  </g>,
  'moon': <path d="M13 9.4A5.2 5.2 0 016.6 3 5.4 5.4 0 108 13.4a5.4 5.4 0 005-4z" />,
  'phone': <path d="M3.2 4.3c0-.6.5-1.1 1.1-1.1h1.5c.5 0 .9.3 1 .8l.5 1.9c.1.4 0 .8-.4 1l-1 .7a7.6 7.6 0 003.5 3.5l.7-1c.2-.3.6-.5 1-.4l1.9.5c.5.1.8.5.8 1v1.5c0 .6-.5 1.1-1.1 1.1A11.4 11.4 0 013.2 4.3z" />,
  'building': <g>
    <path d="M3.6 13.8V3a.6.6 0 01.6-.6h5a.6.6 0 01.6.6v10.8" />
    <path d="M9.8 6.6h2.6a.6.6 0 01.6.6v6.6" />
    <path d="M2.2 13.8h11.6" />
    <path d="M5.6 5.1h2M5.6 7.6h2M5.6 10.1h2" />
  </g>,
  'book': <g>
    <path d="M13 2H4.5A1.5 1.5 0 003 3.5v9A1.5 1.5 0 014.5 11H13z" />
    <path d="M4.5 11H13v3H4.5A1.5 1.5 0 013 12.5" />
  </g>,
  // היציאה מצוירת שמאלה — בממשק ימין-לשמאל "החוצה" הוא לכיוון סוף השורה
  'logout': <g>
    <path d="M10 13.8h2.4a1.4 1.4 0 001.4-1.4V3.6a1.4 1.4 0 00-1.4-1.4H10" />
    <path d="M5.5 11.2L2.3 8l3.2-3.2" />
    <path d="M2.3 8H10" />
  </g>,
};

interface Props extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: IconName;
  size?: number;
}

export default function Icon({ name, size = 16, ...rest }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {PATHS[name]}
    </svg>
  );
}
