import type { ReactNode } from 'react';
import type { MotifName } from './libraryModel';

const shapes: Record<MotifName, ReactNode> = {
  orbit: <><circle cx="32" cy="32" r="19" /><ellipse cx="32" cy="32" rx="10" ry="26" transform="rotate(42 32 32)" /><circle cx="45" cy="18" r="4" /></>,
  branch: <><path d="M17 48V17h30M17 39l13-13 10 10 13-20" /><path d="M43 16h10v10" /></>,
  pages: <><path d="M18 11h25l8 8v34H18zM43 11v10h8M25 29h19M25 37h19M25 45h12" /><path d="M12 19v39h30" /></>,
  sprout: <><path d="M32 54V30M32 40C13 42 9 29 13 20c14-1 21 5 19 20ZM32 32C31 15 42 9 53 13c1 13-6 21-21 19Z" /></>,
  layers: <path d="m8 23 24-13 24 13-24 14zM10 34l22 13 22-13M10 45l22 13 22-13" />,
  shield: <><path d="M32 8c8 6 16 7 22 8v17c0 12-9 20-22 25C19 53 10 45 10 33V16c6-1 14-2 22-8Z" /><path d="m22 32 7 7 14-15" /></>,
  chart: <path d="M12 10v44h43M23 43V28M35 43V19M47 43V10" />,
  grid: <><rect x="11" y="11" width="42" height="42" rx="4" /><path d="M11 25h42M25 11v42M39 25v28M11 39h42" /></>,
  house: <path d="m8 30 24-20 24 20M15 25v30h34V25M26 55V38h12v17" />,
};
export default function KnowledgeArt({ name = 'pages' }: { name?: MotifName }) {
  return <svg viewBox="0 0 64 64" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">{shapes[name]}</svg>;
}
