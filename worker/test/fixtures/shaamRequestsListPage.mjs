// ─── דף בדיקה שמחקה את «בקשות בתהליך» ב«מערכת לרישום ייצוג» ───────────────
// ‼ ההתנהגויות כאן **נצפו חי** (28.09.2026, קריאה בלבד — ראה
// shaam-requests-grid-2026-09-28.json):
//   · Kendo grid: כל השורות ב-dataSource (8 בעמוד), jQuery(grid).data('kendoGrid').
//   · «ניקוי» מאפס את הטופס; בלעדיו השדות **זוכרים** את החיפוש הקודם.
//   · «סינון לפי : מספר ישות [+ מספר בקשה]» אחרי חיפוש.
//   · אין תוצאות ⇒ div.alert-info «לא נמצאו רשומות מתאימות», בלי טבלה.
//   · פירוט שורה: «תיק החזר מס (91)» קיים ב-DOM תמיד, גלוי רק לתיק 91 (ng-hide).
//   · חיפוש לפי «מספר בקשה» מוצא רק בקשות מ~30 הימים האחרונים (דן רכס 12/08 — לא
//     נמצא; הדסה 23/09 — נמצאה). חיפוש לפי ישות מוצא הכול.
// ‼ זה **לא** שע״ם — זה מאפשר להריץ את הקוד האמיתי של העובד מול אותו מבנה.

/**
 * @param o.rows       פריטי ה-dataSource (כמו בקובץ ה-fixture)
 * @param o.tik91      asmachta שלהם הפירוט מציג «תיק החזר מס (91)» גלוי
 * @param o.brokenClear «ניקוי» לא מנקה את השדות (לבדיקת עצירה)
 * @param o.prefill    ערכים שנשארו בטופס מחיפוש קודם: {yeshut, num}
 */
export function requestsListHtml({ rows = [], tik91 = [], brokenClear = false, prefill = {}, today = '2026-09-28' } = {}) {
  const data = JSON.stringify(rows);
  return `<!doctype html><html dir="rtl"><head><meta charset="utf-8">
  <style>.ng-hide{display:none!important}</style></head><body>
  <div id="app">
    <a href="#" id="tabProcess">בקשות בתהליך</a> <a href="#" id="tabNew">בקשה חדשה</a>
    <h4>רשימת בקשות</h4>
    <div class="col-sm-6"><div class="row"><label for="yeshut" class="col-sm-4">ישות מיוצג</label><div class="col-sm-8"><input id="yeshut" name="yeshut" type="text" value="${prefill.yeshut ?? ''}"></div></div></div>
    <div class="col-sm-6"><div class="row"><label class="col-sm-4">מספר בקשה</label><div class="col-sm-8"><input id="num" type="text" value="${prefill.num ?? ''}"></div></div></div>
    <button id="btnSearch">חיפוש</button> <button id="btnClear">ניקוי</button>
    <div class="row"><div class="col-sm-12"><p class="fontbold" id="echo" style="display:none"></p></div></div>
    <div id="emptyWrap"></div>
    <p id="shown"></p>
    <div id="grid" data-role="grid"><table><thead><tr><th></th><th>ת.הזנה</th><th>שם הלקוח</th><th>מצב בקשה</th><th>מערך</th><th>מספר תיק</th><th>מצב מערך</th><th>סוג ייצוג</th><th>פעולות</th></tr></thead><tbody id="tb"></tbody></table></div>
  </div>
  <script>
    const ALL = ${data};
    const TIK91 = new Set(${JSON.stringify(tik91.map(String))});
    const BROKEN_CLEAR = ${brokenClear ? 'true' : 'false'};
    const TODAY = Date.parse('${today}T00:00:00Z');
    const recent = (r) => TODAY - Date.parse(r.tarHazana.slice(0, 10) + 'T00:00:00Z') <= 30 * 86400000;
    const log = (window.__log = []);
    let view = ALL.map((r, i) => ({ ...r, uid: 'u' + i }));
    const grid = document.getElementById('grid');
    const mkData = () => { const a = view.map((r) => ({ ...r })); a.toJSON = () => view.map((r) => { const { uid, ...rest } = r; return rest; }); return a; };
    grid.__grid = {
      columns: ['tarHazana','shemMuzag','statusBakashaTeur','teurMaarac','misTik','statusTikTeur','sugIzugTeur','isn','statusBakashaKod','statusTikKod','kodMaarach','shemMyzg','misTikWork','misMuzag','isBehamtana','bitulTeur','goremMezinBakasha','dateTzefiSyumHashaya','idDokimentum'].map((field) => ({ field })),
      dataSource: { data: () => mkData(), total: () => view.length, pageSize: () => 8 },
    };
    window.jQuery = (el) => ({ data: (k) => (k === 'kendoGrid' ? el.__grid : undefined) });
    function render() {
      const tb = document.getElementById('tb');
      tb.innerHTML = '';
      const empty = view.length === 0;
      grid.style.display = empty ? 'none' : '';
      document.getElementById('emptyWrap').innerHTML = empty ? '<div class="alert alert-info">לא נמצאו רשומות מתאימות</div>' : '';
      document.getElementById('shown').textContent = empty ? '' : 'מוצגים ' + view.length + ' תיקים';
      for (const r of view.slice(0, 8)) {
        const tr = document.createElement('tr');
        tr.className = 'k-master-row';
        tr.setAttribute('data-uid', r.uid);
        tr.innerHTML = '<td class="k-hierarchy-cell"><a class="k-icon k-i-expand" href="#"></a></td><td>' + r.tarHazana.slice(0, 10) + '</td><td>' + r.shemMuzag + '</td><td>' + r.statusBakashaTeur + '</td><td>' + r.teurMaarac + '</td><td>' + r.misTik + '</td><td>' + r.statusTikTeur + '</td><td>' + r.sugIzugTeur + '</td><td><div class="icon details_icon" k-content="\\'אירועים קודמים\\'"></div></td>';
        tr.querySelector('a.k-i-expand').addEventListener('click', (e) => {
          e.preventDefault();
          log.push('expand:' + r.asmachta);
          const d = document.createElement('tr');
          d.className = 'k-detail-row';
          const is91 = TIK91.has(String(r.asmachta)) && r.kodMaarach === 1;
          d.innerHTML = '<td class="k-hierarchy-cell"></td><td colspan="8"><p>מספר בקשה</p><p>' + r.asmachta + '</p><p>ת.עדכון מערך</p><p>18/08/2026</p><p>צפי לסיום השהייה</p><p>' + r.dateTzefiSyumHashaya + '</p>'
            + '<div class="' + (is91 ? '' : 'ng-hide') + '"><p>תיק החזר מס (91)</p></div><p>שם תיק</p><p>' + r.shemMuzag + '</p></td>';
          tr.after(d);
          e.target.className = 'k-icon k-i-collapse';
        });
        tb.appendChild(tr);
      }
    }
    document.getElementById('btnSearch').addEventListener('click', () => {
      const y = document.getElementById('yeshut').value.replace(/\\D/g, '');
      const n = document.getElementById('num').value.replace(/\\D/g, '');
      log.push('search:' + y + '|' + n);
      const parts = [];
      if (y) parts.push('מספר ישות');
      if (n) parts.push('מספר בקשה');
      const echo = document.getElementById('echo');
      echo.textContent = 'סינון לפי : ' + parts.join(' + ');
      echo.style.display = parts.length ? '' : 'none';
      view = ALL.map((r, i) => ({ ...r, uid: 'u' + i }))
        .filter((r) => (!y || String(r.misMuzag).replace(/^0+/, '') === y.replace(/^0+/, '')) && (!n || (String(r.asmachta) === n && recent(r))));
      render();
    });
    document.getElementById('btnClear').addEventListener('click', () => {
      log.push('clear');
      if (!BROKEN_CLEAR) { document.getElementById('yeshut').value = ''; document.getElementById('num').value = ''; }
      document.getElementById('echo').style.display = 'none';
      view = ALL.map((r, i) => ({ ...r, uid: 'u' + i }));
      render();
    });
    render();
  </script></body></html>`;
}
