import { SAMPLE_SIMULATED_TEXT } from './sample';

/**
 * ‼ המשפט שמופיע ליד כל פקד שבתצוגה לדוגמה היה שולח/שומר/מעלה משהו.
 * אותו ניסוח בכל המסכים: המשרד רואה במה הלקוח ילחץ, ולא נשאר עם הרושם
 * שמשהו נשלח או נשמר באמת.
 */
export default function SampleSimulatedNote({ style }: { style?: React.CSSProperties }) {
  return (
    <div
      role="status"
      data-testid="sample-simulated-note"
      style={{
        marginTop: 10, padding: '9px 11px', background: '#EEF3FB', color: '#26456E',
        border: '1px solid #CFDCF0', borderRadius: 9, fontSize: 12.5, lineHeight: 1.55,
        textAlign: 'start', ...style,
      }}
    >
      {SAMPLE_SIMULATED_TEXT}
    </div>
  );
}
