// ─── דף בדיקה שמחקה את מסך «טעינת מסמכים» (שלב 4) של שע״ם ─────────────────
// ‼ המבנה והמזהים לקוחים מקוד האפליקציה של שע״ם (shaam-src-2026-09-23/):
//   div.BoxA > label.required{שם} + <u>{קובץ}</u> + input.icon.plus / .icon.checkmark,
//   דיאלוג לכל שורה עם id קבוע (shaam-window-open-close: id="{{vm.name}}"),
//   shaam-file-upload: input[name=myFile] גלוי + input[name=myFile1] מוסתר,
//   PDF בלבד («סוג הקובץ אינו נתמך»), «טעינת קובץ» ⇒ «החלפת קובץ», .divbutton2 a,
//   «סגירה» בתחתית; «המשך» נכשל על «יש לטעון את כל המסמכים» כששורה גלויה ריקה,
//   ובהצלחה ⇒ #/returnUpload + «אישור קליטת מסמכים למיוצג <ת.ז.> - <שם>».
// ‼ זה **לא** שע״ם. זה מאפשר להריץ את הקוד האמיתי של העובד מול אותו מבנה,
// כולל מקרים שאסור לייצר מול הרשות (דיאלוג שגוי, קובץ שנדחה).

const SLOTS = [
  { id: 1, name: 'טופס ייפוי כוח', dialog: 'dialogTeinatAsmachta', title: 'טעינת בקשה/אסמכתא' },
  { id: 2, name: 'תצלום תעודת זהות או רישיון נהיגה', dialog: 'dialogTeinatTzilumTz', title: 'טעינת תצלום תעודת זהות' },
  { id: 3, name: 'צו ירושה + מכתב מעו"ד', dialog: 'dialogTeinatTzavY', title: 'טעינת צו ירושה' },
  { id: 4, name: 'צו שיפוטי למינוי אפוטרופוס', dialog: 'dialogTeinatIpkH', title: 'טעינת ייפויי כוח' },
  { id: 5, name: 'צילום דרכון', dialog: 'dialogTeinatTzilumDarkon', title: 'טעינת צילום דרכון' },
];

/**
 * @param o.shown     מספרי השורות הגלויות (1 תמיד)
 * @param o.prefilled {slotId: fileName} — שורה שכבר נטען בה קובץ
 * @param o.wrongDialog {slotId: dialogIdToOpenInstead}
 * @param o.spouse    'none' | 'optional' | 'required'
 */
export function step4Html({ entityId, name, requestNumber = '2026538930', shown = [1], prefilled = {}, wrongDialog = {}, spouse = 'none' }) {
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const rows = SLOTS.map((s) => {
    const vis = shown.includes(s.id);
    const pre = prefilled[s.id];
    return `
      <div data-row="${s.id}">
        <div class="BoxA row" style="${vis ? '' : 'display:none'}">
          <div class="col-sm-4"><label class="required">${esc(s.name)}</label></div>
          <div class="col-sm-7"><u>${pre ? esc(pre) : ''}</u></div>
          <div class="plus-wrap" style="${pre ? 'display:none' : ''}">
            <input type="button" class="col-sm-1 icon plus" data-open="${esc(wrongDialog[s.id] ?? s.dialog)}" value="+" />
          </div>
          <div class="done-wrap" style="${pre ? '' : 'display:none'}">
            <div class="col-sm-1 icon replace">↻</div><div class="col-sm-1 icon checkmark">✓</div>
          </div>
        </div>
      </div>`;
  }).join('');
  const dialogs = SLOTS.map((s) => `
    <div class="modal" id="${s.dialog}" data-slot="${s.id}" style="display:none">
      <div class="modal-content">
        <div class="modal-header"><button class="close">×</button><h4 class="modal-title">${esc(s.title)}</h4></div>
        <div class="modal-body">
          <div class="mode1">
            <div class="k-upload-button"><span>טעינת קובץ</span><input type="file" name="myFile" /></div>
          </div>
          <div class="mode3" style="display:none"><div class="k-upload-button"><input type="file" name="myFile1" /></div></div>
          <div class="divbutton2"></div>
          <div id="errDiv" class="alert-warning" style="display:none"></div>
        </div>
        <div class="modal-footer"><button class="btn btn-primary">סגירה</button></div>
      </div>
    </div>`).join('');
  const spouseBox = spouse === 'none' ? '' : `
    <div class="row"><input type="checkbox" ng-model="vm.isCheckeChatimatBz" ${spouse === 'required' ? 'class="required"' : ''} />
    <p>אני מאשר את חתימת בן\\ת הזוג על טופס ייפוי הכוח</p></div>`;
  return `<!doctype html><html dir="rtl"><head><meta charset="utf-8"></head><body>
  <div id="app">
    <div class="bs-wizard">
      <div class="bs-wizard-step"><div class="bs-wizard-dot">1</div></div>
      <div class="bs-wizard-step"><div class="bs-wizard-dot">2</div></div>
      <div class="bs-wizard-step"><div class="bs-wizard-dot">3</div></div>
      <div class="bs-wizard-step"><div class="bs-wizard-dot active" id="dot4">4</div></div>
      <div class="bs-wizard-step"><div class="bs-wizard-dot" id="dot5">5</div></div>
    </div>
    <div class="strip">1 אימות ישות 2 בקשת ייפוי כוח 3 פרטי התקשרות 4 טעינת מסמכים 5 השהייה וסיום</div>
    <h4>בקשה לרישום ייפוי כוח חדש</h4>
    <h4>מספר בקשה: ${esc(requestNumber)}</h4>
    <h4 id="heading">טעינת מסמכים למיוצג ${esc(entityId)} - ${esc(name)}</h4>
    <h4>יש לטעון את המסמכים הבאים:</h4>
    <div class="alert alert-danger" id="err" style="display:none"></div>
    <div class="bluediv">${rows}</div>
    ${spouseBox}
    <button btntype="hemshech" id="hemshech">המשך</button>
    <button btntype="chazara" style="display:none">חזרה</button>
  </div>
  ${dialogs}
  <script>
    const uploaded = {};
    const log = (window.__log = []);
    document.querySelectorAll('input.icon.plus').forEach((b) => b.addEventListener('click', () => {
      log.push('plus:' + b.closest('[data-row]').dataset.row);
      document.getElementById(b.dataset.open).style.display = 'block';
    }));
    document.querySelectorAll('.modal').forEach((m) => {
      const slot = m.dataset.slot;
      const input = m.querySelector('input[name=myFile]');
      input.addEventListener('change', () => {
        const f = input.files[0];
        log.push('file:' + slot + ':' + (f && f.name));
        setTimeout(() => {
          const err = m.querySelector('#errDiv');
          if (!/\\.pdf$/i.test(f.name)) { err.textContent = 'סוג הקובץ אינו נתמך'; err.style.display = 'block'; return; }
          m.querySelector('.divbutton2').innerHTML = '<a href="#">' + f.name + '</a>';
          m.querySelector('.k-upload-button span').textContent = 'החלפת קובץ';
          uploaded[slot] = f.name;
        }, 150);
      });
      const close = () => {
        m.style.display = 'none';
        const row = document.querySelector('[data-row="' + slot + '"]');
        if (uploaded[slot] && row) {
          row.querySelector('u').textContent = uploaded[slot];
          row.querySelector('.plus-wrap').style.display = 'none';
          row.querySelector('.done-wrap').style.display = '';
        }
      };
      m.querySelector('.modal-footer button').addEventListener('click', close);
      m.querySelector('.close').addEventListener('click', close);
    });
    document.getElementById('hemshech').addEventListener('click', () => {
      log.push('hemshech');
      const visibleRows = [...document.querySelectorAll('.BoxA')].filter((b) => b.offsetParent !== null);
      const empty = visibleRows.filter((b) => !b.querySelector('u').textContent.trim());
      const err = document.getElementById('err');
      if (empty.length) { err.textContent = 'יש לטעון את כל המסמכים'; err.style.display = 'block'; return; }
      const box = document.querySelector('input[ng-model="vm.isCheckeChatimatBz"].required');
      if (box && !box.checked) { err.textContent = 'חתימת בן/ת הזוג הרשום על הטופס הינה חובה '; err.style.display = 'block'; return; }
      location.hash = '#/returnUpload';
      document.getElementById('app').innerHTML =
        '<h4>אישור קליטת מסמכים למיוצג ${esc(entityId)} - ${esc(name)}</h4><strong>אנחנו בודקים כרגע את הקבצים שצירפת</strong>';
    });
  </script>
  </body></html>`;
}
