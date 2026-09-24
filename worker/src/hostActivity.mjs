// hostActivity.mjs — כמה שניות עברו מאז שמישהו נגע במקלדת/עכבר במחשב הזה.
//
// ‼ 203 · למה: התחברות לשע״ם/ב״ל (אישור דיגיטלי, PIN, קוד) דורשת אדם ליד
// המחשב. כשכמה מחשבי עבודה מחוברים, משימת התחברות הולכת למחשב שבו עבדו
// לאחרונה (automation_worker_should_take), ולא לזה ש«במקרה» משך ראשון.
// ‼ רק מספר — לא מה הוקלד, לא איזה חלון. נמדד ב-GetLastInputInfo של Windows.

import { execFile } from 'node:child_process';

const PS = `
Add-Type @'
using System; using System.Runtime.InteropServices;
public static class PivoIdle {
  [StructLayout(LayoutKind.Sequential)] struct LII { public uint cbSize; public uint dwTime; }
  [DllImport("user32.dll")] static extern bool GetLastInputInfo(ref LII l);
  public static uint Seconds() { var l = new LII(); l.cbSize = (uint)Marshal.SizeOf(l);
    if (!GetLastInputInfo(ref l)) return uint.MaxValue; return ((uint)Environment.TickCount - l.dwTime) / 1000; }
}
'@
[PivoIdle]::Seconds()`;

let cached = null;
let cachedAt = 0;
let inFlight = null;

/** קריאה מהמטמון (עד דקה). null ⇒ לא ידוע (לא Windows / כשל) — השרת מתייחס כ«אינסוף». */
export async function hostIdleSeconds({ now = Date.now(), maxAgeMs = 60_000 } = {}) {
  if (process.platform !== 'win32') return null;
  if (cached !== null && now - cachedAt < maxAgeMs) return cached;
  if (!inFlight) {
    inFlight = new Promise((resolve) => {
      execFile('powershell', ['-NoProfile', '-NonInteractive', '-Command', PS], { timeout: 15_000, windowsHide: true },
        (err, stdout) => {
          const n = Number(String(stdout ?? '').trim());
          resolve(!err && Number.isFinite(n) && n < 4_000_000_000 ? n : null);
        });
    }).then((v) => { cached = v; cachedAt = Date.now(); inFlight = null; return v; });
  }
  return inFlight;
}
