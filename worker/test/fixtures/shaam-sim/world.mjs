// world.mjs — שע״ם מדומה + חלון Chrome מדומה, כדי להריץ את הקוד **האמיתי** של
// העובד (connectionMonitor, shaamConnect, יישור קו, פרטי תיק) בלי דפדפן.
//
// מה מדומה: הפורטל (סיסמה ראשונה: אישור דיגיטלי/PIN ⇒ attach 'blocked', ואז
// קוד חד-פעמי), מערכת גביית מס הכנסה (GMF: מסך כניסה/תפריט/134/181), וחלונית
// הסיסמאות של Chrome. מה אמיתי: כל ההכרעות — browserSession, gmfAutoLogin,
// warmupManager, connectionMonitor וה-handlers עצמם.
//
// ‼ שעון מדומה: Date.now מוזז קדימה בכל waitForTimeout ובכל advance(), כדי
// שהמתנות של שניות (settlePage, המתנה לרו"ח, קצב הצופה) ירוצו מיד.

const ORIGIN = 'https://shaam.taxes.gov.il';
const HOME = '/myz/pages/homepage.aspx';
const OTP = '/taxes-login/login/otpCts';
const GMF_LOGIN = '/gmf-main-menu/login';
const GMF_MENU = '/gmf-main-menu/main/home';
export const USERNAME = 'D1466734';

const realNow = Date.now.bind(Date);
let offset = 0;
Date.now = () => realNow() + offset;

export const world = {
  /** 'closed' | 'dialog' (אישור דיגיטלי/PIN פתוח ⇒ attach נחסם) | 'open' */
  chrome: 'closed',
  portal: false,
  gmfSession: false,
  savedCredential: USERNAME,
  savedPasswordAccepted: true,
  pages: [],
  /** מה PIVO עשתה — הראיות שהבדיקות בודקות. */
  pivo: { picks: 0, submits: 0, focusClicks: 0, gotos: [] },
  humanSubmits: 0,
  /** פעולות רו"ח מתוזמנות: (world) => boolean (true = בוצע, להסיר). */
  humanScript: [],
  reports: [],
};

export function resetWorld() {
  Object.assign(world, {
    chrome: 'closed', portal: false, gmfSession: false,
    savedCredential: USERNAME, savedPasswordAccepted: true, pages: [],
    pivo: { picks: 0, submits: 0, focusClicks: 0, gotos: [] }, humanSubmits: 0, humanScript: [], reports: [],
  });
}

export async function advance(ms) {
  offset += ms;
  world.humanScript = world.humanScript.filter((step) => !step(world));
  await new Promise((r) => setImmediate(r));
}

export const context = {
  pages: () => world.pages,
  newPage: async () => { const p = new SimPage(); world.pages.push(p); return p; },
};

export function tab() {
  return world.pages[0];
}

// ─── פעולות הרו"ח ───────────────────────────────────────────────────────────
export const human = {
  /** אישור דיגיטלי + PIN + קוד + מספר מעסיק ⇒ דף הבית של הפורטל. */
  completeFirstPassword() {
    world.chrome = 'open';
    world.portal = true;
    tab().go(HOME);
  },
  /** בוחר בחלונית של Chrome את הסיסמה השמורה (Chrome ממלא). */
  pickSaved(page = tab()) {
    if (!page.onGmfLogin()) return false;
    page.pass = { ...page.pass, value: 'saved', autofilled: true };
    return true;
  },
  /** לוחץ «כניסה» בעצמו. */
  submit(page = tab()) {
    if (!page.onGmfLogin() || !page.pass.value) return false;
    world.humanSubmits++;
    world.gmfSession = true;
    page.go(GMF_MENU);
    return true;
  },
};

// ─── הדף ─────────────────────────────────────────────────────────────────────
export class SimPage {
  constructor(path = 'about:blank') {
    this.path = path;
    this.pass = { value: '', autofilled: false, focused: false };
    this.fields = {};
  }

  url() { return this.path === 'about:blank' ? 'about:blank' : ORIGIN + this.path; }
  async title() { return this.path.toLowerCase() === HOME ? 'HomePage' : ''; }
  context() { return context; }
  onGmfLogin() { return this.path.startsWith(GMF_LOGIN); }
  go(path) { this.path = path; this.pass = { value: '', autofilled: false, focused: false }; }

  async bringToFront() {}
  async reload() {}
  async waitForLoadState() {}
  async waitForURL() {}
  async waitForTimeout(ms) { await advance(ms); }

  async goto(url) {
    world.pivo.gotos.push(url);
    const path = new URL(url).pathname;
    if (!world.portal) {
      // בלי פורטל: הכניסה נפתחת — דיאלוג האישור הדיגיטלי ואז הקוד החד-פעמי.
      if (path === '/') world.chrome = 'dialog';
      this.go(OTP);
      return;
    }
    if (path === '/') { this.go(HOME); return; }
    if (path.startsWith('/gmf-main-menu')) { this.go(world.gmfSession ? GMF_MENU : GMF_LOGIN); return; }
    this.go(path);
  }

  async click(sel) {
    if (sel === '#pass' && this.onGmfLogin()) {
      world.pivo.focusClicks++;
      this.pass.focused = true;
      return;
    }
    return this.#clickControl(sel);
  }

  #clickControl(sel) {
    if (sel.includes('gmfBtnHmse')) {
      if (this.fields['#mavarShilta'] === '134') this.path = '/gmf-134/main/knisa';
      else if (this.fields['#mavarShilta'] === '181') this.path = '/gmf-181/main/main181';
      return;
    }
    if (sel === '#btnContinue') { this.path = '/gmf-134/main/meda'; return; }
  }

  #hasControl(sel) {
    const gmfWork = this.path.startsWith('/gmf-') && !this.onGmfLogin();
    if (sel === '#pass') return this.onGmfLogin();
    if (sel === '#gmftxtMisTik' || sel === '#mavarShilta') return gmfWork;
    return gmfWork;
  }

  async $(sel) {
    if (!this.#hasControl(sel)) return null;
    return { fill: async (v) => { this.fields[sel] = v; } };
  }
  async fill(sel, v) { this.fields[sel] = v; }
  async $eval(sel) { return this.fields[sel] ?? ''; }
  locator(sel) {
    const self = this;
    const loc = {
      first: () => loc,
      count: async () => (self.#hasControl(sel) ? 1 : 0),
      click: async () => self.#clickControl(sel),
    };
    return loc;
  }

  async evaluate(fn, arg) {
    const src = fn.toString();
    const onLogin = this.onGmfLogin();
    if (src.includes('שם משתמש')) {
      return {
        onLogin, hasField: onLogin, hasValue: onLogin && !!this.pass.value, autofilled: onLogin && this.pass.autofilled,
        focused: onLogin && this.pass.focused, username: onLogin ? USERNAME : null, hasForm: onLogin,
        visibleSubmits: onLogin ? 1 : 0, humanOnlyModal: false, modalTitle: null,
      };
    }
    if (src.includes('btn.click')) {
      world.pivo.submits++;
      if (this.pass.autofilled && world.savedPasswordAccepted) { world.gmfSession = true; this.go(GMF_MENU); }
      return true;
    }
    if (src.includes('/myz/pages/homepage.aspx')) {
      return world.portal
        ? { status: 200, finalUrl: ORIGIN + HOME, len: 95000, hasLogout: true }
        : { status: 200, finalUrl: ORIGIN + OTP, len: 3341, hasLogout: false };
    }
    if (src.includes('.modal.d-block, .modal.show\'')) return { blocked: false };
    if (src.includes('app-meda-header')) return { pathname: this.path, taxOffice: { ok: true, text: '26 - רחובות' } };
    if (src.includes('labelText')) return { infoExists: true, infoChecked: true, labelText: 'מידע לתיק', yearChecked: true };
    if (src.includes('fileNumberInScreenText')) {
      const leftMenu = !this.path.startsWith('/gmf-main-menu');
      const onFileDetailsScreen = this.path.startsWith('/gmf-181');
      return {
        matchesRequestedFile: leftMenu && onFileDetailsScreen, leftMenu, onFileDetailsScreen,
        fileNumberInScreenText: leftMenu, pathname: this.path, hasContent: leftMenu, hasPasswordField: false,
      };
    }
    if (src.includes('app-meda-header')) {
      return { pathname: this.path, taxOffice: { ok: true, text: '26 - רחובות' } };
    }
    if (src.includes('מערכת לרישום ייצוג')) return { hasPasswordField: false, titleMatches: false, hasReadyMarkers: false, hasCredentialControl: false };
    if (src.includes('input[type=password]')) return onLogin;
    throw new Error(`evaluate לא מוכר בסימולציה: ${src.slice(0, 100)}`);
  }
}

// ─── חלונית הסיסמאות של Chrome ───────────────────────────────────────────────
export async function simPickSavedPassword({ username }) {
  world.pivo.picks++;
  const page = world.pages.find((p) => p.onGmfLogin() && p.pass.focused);
  if (!page) return { status: 'no_popup' };
  if (!world.savedCredential || username !== world.savedCredential) return { status: 'no_matching_credential', rows: 1 };
  page.pass = { ...page.pass, value: 'saved', autofilled: true };
  return { status: 'invoked', rows: 2 };
}
