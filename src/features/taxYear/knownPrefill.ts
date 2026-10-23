import type { Client } from '../../types';
import type { InfoAsk, MultiFollowUp, Purpose } from './types';
import { ITEM_BY_KEY } from './catalog';
import { RECORD_OF, isPeriodItem } from './structured';
import { questionnaireClient } from './knownClient';
import { answerValid, initialFromCard, schemaFor, type RecordValue, type RecordAnswer } from './records';

/** Open, older questionnaires can reuse newly available card data. Confirmation
 * snapshots and submitted answers remain historical; records send their actual
 * values through the existing submission contract. User drafts always win. */
export function prefillOpenAsks(asks: InfoAsk[], client: Client, purpose: Purpose, year: number): InfoAsk[] {
  const c = questionnaireClient(client, purpose === 'annual' || purpose === 'estimate' ? year : undefined);
  const drafted = new Set<string>();
  const confirmed = new Map<string, RecordAnswer>();
  for (const a of asks) {
    const saved = a.savedDraft as { v2?: Record<string, { choice?: string; record?: RecordAnswer }> } | undefined;
    for (const [key, d] of Object.entries(saved?.v2 ?? {})) {
      drafted.add(key);
      if (d?.choice === 'yes' && d.record) confirmed.set(key, d.record);
    }
    if (saved && !saved.v2) drafted.add(identity(a));
  }
  const hydrate = (original: InfoAsk, depth = 0): InfoAsk => {
    if (depth > 8 || original.state !== 'published') return original;
    const nested = (f: MultiFollowUp): MultiFollowUp => {
      const x = hydrate({ ...original, ...f, savedDraft: undefined, prompt: f.prompt } as InfoAsk, depth + 1);
      return { ...f, prompt: x.prompt };
    };
    const p = original.prompt;
    const a: InfoAsk = { ...original, prompt: { ...p,
      ...(p.onYes ? { onYes: p.onYes.map(nested) } : {}),
      ...(p.onChanged ? { onChanged: p.onChanged.map(nested) } : {}),
      ...(p.onValue ? { onValue: p.onValue.map(v => ({ ...v, ask: nested(v.ask) })) } : {}),
      ...(p.input.kind === 'multi' ? { input: { ...p.input, options: p.input.options.map(o => ({ ...o,
        ...(o.followUp ? { followUp: nested(o.followUp) } : {}),
        ...(o.followUps ? { followUps: o.followUps.map(nested) } : {}) })) } } : {}) } };
    const input = a.prompt.input;
    if (a.state !== 'published' || input.kind !== 'record' ||
        isPeriodItem(a.itemKey) || RECORD_OF[a.itemKey] !== input.schema) return a;
    if (drafted.has(identity(a))) {
      const record = confirmed.get(identity(a));
      return record && !record.none && answerValid(schemaFor(input.schema, undefined, input.context), record)
        ? { ...a, prompt: { ...a.prompt, knownRow: purpose === 'annual', input: { ...input, initial: record.items } } } : a;
    }
    const additionalEmployer = a.itemKey === 'salary.employerDetails' && !!a.prompt.onCard?.length;
    if (additionalEmployer) return { ...a, prompt: { ...a.prompt, input: { ...input,
      context: { ...input.context, additionalEmployer: '1' } } } };
    if (ITEM_BY_KEY[a.itemKey]?.onlyNew && a.itemKey !== 'salary.employerDetails') return a;
    const rows = initialFromCard(input.schema, c, a.subjectRole, purpose === 'annual' || purpose === 'estimate' ? year : undefined);
    const matching = a.entityRef && !/-new-/.test(a.entityRef)
      ? rows.filter(r => r.id === a.entityRef) : rows;
    if (!matching.length) {
      const oldDefault = input.schema === 'employer' && input.initial?.length === 1 && !input.initial[0].name &&
        (input.initial[0].startDate as { precision?: string } | undefined)?.precision === 'unknown';
      return oldDefault ? { ...a, prompt: { ...a.prompt, input: { ...input, initial: [{ endDate: { precision: 'unknown' } }] } } } : a;
    }
    // Keep the snapshot's non-empty values. Only complete an unambiguous match.
    const previous = (input.initial ?? []) as RecordValue[];
    const initial = previous.some(r => r.id || r.name || r.company || r.institution || r.firstName)
      ? previous.map(r => {
        const matches = matching.filter(x => r.id ? x.id === r.id : r.name ? x.name === r.name : false);
        return matches.length === 1 ? { ...matches[0], ...r } : r;
      }) : matching;
    const complete = answerValid(schemaFor(input.schema, undefined, input.context), { items: initial });
    return { ...a, prompt: { ...a.prompt, ...(purpose === 'annual' && complete && input.schema !== 'property' && input.schema !== 'account' ? { knownRow: true } : {}),
      input: { ...input, initial } } };
  };
  return asks.map(a => hydrate(a));
}

const identity = (a: InfoAsk) => `${a.itemKey}|${a.subjectRole}|${a.entityRef ?? ''}`;
