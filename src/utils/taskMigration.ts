import { Task, TaskCategory, LEGACY_CATEGORY_MAP } from '../types';

const NEW_CATEGORY_VALUES: TaskCategory[] = [
  'annual_report', 'institutions', 'management', 'economic_work',
  'personal_report', 'cutoff', 'wealth_declaration', 'ongoing',
  'discussions', 'special_approval', 'not_selected',
];

function isNewCategory(v: string): v is TaskCategory {
  return (NEW_CATEGORY_VALUES as string[]).includes(v);
}

export interface MigrationResult {
  tasks: Task[];
  migratedCount: number; // כמה משימות עברו שינוי כלשהו
}

/**
 * ממירה משימות מהפורמט הישן (קטגוריות מ"ה/ב"ל/וכו', סטטוס בינארי) לפורמט החדש
 * (קטגוריות בסגנון מונדיי, סטטוס + progress). אידמפוטנטית — ריצה חוזרת לא משנה.
 */
export function migrateTasks(tasks: Task[]): MigrationResult {
  let migratedCount = 0;

  const out = tasks.map(t => {
    let changed = false;
    const next: Task = { ...t };

    // קטגוריה
    if (!isNewCategory(t.category as string)) {
      const mapped = LEGACY_CATEGORY_MAP[t.category as string];
      next.category = mapped ?? 'not_selected';
      changed = true;
    }

    // progress — אם חסר ולא 'done':
    //   - אם הכדור אצל לקוח/רשות/תקוע → כבר עבדנו עליה והעברנו, אז 'in_progress'
    //   - אם הכדור אצלי → 'new' (עדיין לא התחלתי)
    if (t.status === 'open' && !t.progress) {
      next.progress = t.ballWith === 'me' ? 'new' : 'in_progress';
      changed = true;
    }

    if (changed) migratedCount++;
    return next;
  });

  return { tasks: out, migratedCount };
}
