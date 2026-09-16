// ─── «חיבור לשע״ם» · הכנת סביבת עבודה ────────────────────────────────────────
// פרק 16 §16.1: אילו מערכות מוכנות אוטומטית אחרי לחיצה אחת על "התחבר לשע״ם"
// — לא מסך ניהול חדש, אלא הגדרה בתוך הגדרות החיבור הקיימות. נשמר תחת
// profile.settings.shaamWarmup.capabilities, אותה עמודת jsonb קיימת כמו כל
// שאר "המשרד" (אותו דפוס בדיוק כמו RepresentationSettingsSection).
//
// ‼ הסרה מהרשימה אינה ביטול הרשאה להשתמש ביכולת — רק "אל תכין אותה מראש".
// פעולה מאוחרת (shaam.ensure_capability) עדיין יכולה להכין אותה לפי צורך.
import type { FirmProfile } from '../../types/firmProfile';
import { SHAAM_WARMUP_CAPABILITIES, SHAAM_WARMUP_CAPABILITY_LABELS } from '../../types/automation';
import type { ShaamWarmupCapability } from '../../types/automation';

interface Props {
  profile: FirmProfile;
  onChangeProfile: React.Dispatch<React.SetStateAction<FirmProfile>>;
}

function selectedCapabilities(profile: FirmProfile): ShaamWarmupCapability[] {
  const settings = (profile.settings ?? {}) as Record<string, unknown>;
  const configured = (settings.shaamWarmup as { capabilities?: unknown } | undefined)?.capabilities;
  return Array.isArray(configured) && configured.length
    ? (configured as ShaamWarmupCapability[])
    : [...SHAAM_WARMUP_CAPABILITIES];
}

export default function ShaamWarmupSettingsSection({ profile, onChangeProfile }: Props) {
  const selected = selectedCapabilities(profile);

  function toggle(capability: ShaamWarmupCapability) {
    const next = selected.includes(capability)
      ? selected.filter((c) => c !== capability)
      : [...selected, capability];
    onChangeProfile((prev) => ({
      ...prev,
      settings: {
        ...(prev.settings ?? {}),
        shaamWarmup: { capabilities: next },
      },
    }));
  }

  return (
    <div>
      <h3 style={{ margin: '0 0 4px', fontSize: 'var(--fs-15)' }}>הכנת סביבת עבודה לשע״ם</h3>
      <p style={{ margin: '0 0 16px', color: 'var(--gray-600)', fontSize: 'var(--fs-13)', maxWidth: '60ch', lineHeight: 1.6 }}>
        לחיצה אחת על "התחבר לשע״ם" בכותרת מכינה אוטומטית את המערכות המסומנות כאן,
        אחרי שהאימות הבסיסי (כרטיס חכם + PIN) הושלם. הסרת מערכת מהרשימה רק
        אומרת "אל תכינו אותה מראש" — אפשר עדיין להשתמש בה לפי צורך.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {SHAAM_WARMUP_CAPABILITIES.map((capability) => (
          <label key={capability} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--fs-13)' }}>
            <input
              type="checkbox"
              checked={selected.includes(capability)}
              onChange={() => toggle(capability)}
            />
            {SHAAM_WARMUP_CAPABILITY_LABELS[capability]}
          </label>
        ))}
      </div>
    </div>
  );
}
