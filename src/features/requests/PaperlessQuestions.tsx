import { useEffect, useId, useRef, useState } from 'react';
import { paperlessAnswersPending, type PaperlessAnswers } from './paperlessAnswers';
import './paperlessQuestions.css';

export default function PaperlessQuestions({ answers, onSave, client = false, readOnly = false }: {
  answers: PaperlessAnswers;
  onSave: (next: PaperlessAnswers, expected: PaperlessAnswers) => Promise<{ ok: boolean; error?: string; simulated?: boolean }>;
  client?: boolean;
  readOnly?: boolean;
}) {
  const id = useId();
  const [saved, setSaved] = useState(answers);
  const [name, setName] = useState(answers.softwareName);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const inFlight = useRef(false);
  const root = useRef<HTMLDivElement>(null);
  const focusNext = useRef(false);
  useEffect(() => { setSaved(answers); setName(answers.softwareName); }, [answers.paperlessStatus, answers.dataSource, answers.softwareName]);
  useEffect(() => {
    if (!busy && focusNext.current) {
      focusNext.current = false;
      root.current?.querySelector<HTMLInputElement>('input:not(:disabled)')?.focus();
    }
  }, [busy]);
  const pending = paperlessAnswersPending(saved);

  async function save(next: PaperlessAnswers) {
    if (readOnly || inFlight.current || JSON.stringify(next) === JSON.stringify(saved)) return;
    inFlight.current = true;
    focusNext.current = client;
    setBusy(true); setError(''); setMessage('');
    setSaved(next);
    try {
      const result = await onSave(next, saved);
      if (!result.ok) { setSaved(saved); setError(result.error || 'התשובה לא נשמרה. אפשר לנסות שוב.'); return; }
      if (result.simulated) { setSaved(saved); setMessage('תצוגה לדוגמה — לא נשמר ולא נשלח דבר.'); return; }
      setSaved(next); setName(next.softwareName); setMessage('נשמר');
    } catch { setSaved(saved); setError('התשובה לא נשמרה. אפשר לנסות שוב.'); }
    finally { inFlight.current = false; setBusy(false); }
  }
  const disabled = busy || readOnly;
  const showStatus = !client || saved.paperlessStatus === 'unknown';
  const showHistory = saved.paperlessStatus === 'none' && (!client || saved.dataSource === 'unknown');
  const showSoftware = saved.paperlessStatus === 'none' && saved.dataSource === 'other_software'
    && (!client || !saved.softwareName);

  return <div className="plq" ref={root} aria-busy={busy}>
    {showStatus && <fieldset disabled={disabled}>
      <legend>האם כבר יש חשבון פייפרלס?</legend>
      <div className="plq-options">
        {([
          ['none', 'אין חשבון'], ['self', 'כן, בניהול עצמי'], ['other_rep', 'כן, אצל מייצג אחר'],
          ...(saved.paperlessStatus === 'not_applicable' ? [['not_applicable', 'לא יעבוד עם פייפרלס']] : []),
        ] as [PaperlessAnswers['paperlessStatus'], string][]).map(([value, label]) =>
          <label key={value}><input type="radio" name={`${id}-account`} checked={saved.paperlessStatus === value}
            onChange={() => void save({ paperlessStatus: value, dataSource: value === 'none' ? 'unknown' : value === 'not_applicable' ? 'none' : 'paperless', softwareName: '' })} />{label}</label>)}
      </div>
    </fieldset>}
    {showHistory && <fieldset disabled={disabled}>
      <legend>האם יש היסטוריה לייבא מתוכנה אחרת?</legend>
      <div className="plq-options">
        {([['none', 'לא'], ['other_software', 'כן']] as const).map(([value, label]) =>
          <label key={value}><input type="radio" name={`${id}-history`} checked={saved.dataSource === value}
            onChange={() => void save({ ...saved, dataSource: value, softwareName: '' })} />{label}</label>)}
      </div>
    </fieldset>}
    {showSoftware && <div className="plq-software">
      <label htmlFor={`${id}-software`}>באיזו תוכנה?</label>
      <div><input id={`${id}-software`} value={name} maxLength={120} disabled={disabled} placeholder="למשל ריווחית"
        onChange={e => { setName(e.target.value); setMessage(''); }}
        onKeyDown={e => { if (e.key === 'Enter' && name.trim()) { e.preventDefault(); void save({ ...saved, softwareName: name.trim() }); } }} />
        <button type="button" disabled={disabled || !name.trim() || name.trim() === saved.softwareName}
          onClick={() => void save({ ...saved, softwareName: name.trim() })}>שמירה</button></div>
    </div>}
    <div className="plq-foot" aria-live="polite">
      {error ? <span role="alert" className="plq-error">{error}</span>
        : busy ? 'שומר…' : !client && pending ? 'לא חייבים למלא כאן — הלקוח ישלים את החסר בדף האישי.'
        : message === 'נשמר' && pending ? '' : message}
    </div>
  </div>;
}
