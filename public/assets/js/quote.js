const yearEl = document.getElementById('year');
if (yearEl) yearEl.textContent = new Date().getFullYear();

const RATES = {
  commercial: {
    captureFullDay: 5500,
    captureHalfDay: 3000,
    gradeFullDay: 1200,
    gradeHalfDay: 600,
    editFullDay: 1200,
    editHalfDay: 600,
  },
  academic: {
    captureFullDay: 2750,
    captureHalfDay: 1500,
    gradeFullDay: 600,
    gradeHalfDay: 300,
    editFullDay: 600,
    editHalfDay: 300,
  },
};

const STORAGE = {
  byo: 0,
  ssd: 1300,
  module: 6149,
};

const AUDIO_DISCOUNT_PER_FULLDAY = 200;

const DEFAULT_STATE = {
  tier: 'commercial',
  length: 'full',
  days: 1,
  audio: 'yes',
  grade: 'yes',
  edit: 'byo',
  delivery: 'finished',
  storage: 'byo',
};

const state = { ...DEFAULT_STATE };

const refs = {
  cards: [...document.querySelectorAll('.option-card[data-group]')],
  dayCounter: document.querySelector('[data-day-counter]'),
  dayValue: document.querySelector('[data-day-value]'),
  dayButtons: [...document.querySelectorAll('[data-day]')],
  discountPill: document.querySelector('[data-discount-pill]'),
  byoNote: document.querySelector('[data-byo-note]'),
  quoteLines: document.querySelector('[data-quote-lines]'),
  quoteDiscounts: document.querySelector('[data-quote-discounts]'),
  total: document.querySelector('[data-total]'),
  mobileTotal: document.querySelector('[data-mobile-total]'),
  mobileLines: document.querySelector('[data-mobile-lines]'),
  mobileDiscounts: document.querySelector('[data-mobile-discounts]'),
  emailQuote: document.querySelector('[data-email-quote]'),
  mobileEmail: document.querySelector('[data-mobile-email]'),
  copyQuote: document.querySelector('[data-copy-quote]'),
  mobileQuote: document.querySelector('[data-mobile-quote]'),
  mobileToggle: document.querySelector('[data-mobile-toggle]'),
  mobilePanel: document.querySelector('#mobile-quote-panel'),
  priceCaptureHalf: document.querySelector('[data-price="captureHalf"]'),
  priceCaptureFull: document.querySelector('[data-price="captureFull"]'),
  priceGrade: document.querySelector('[data-price="grade"]'),
  priceEdit: document.querySelector('[data-price="edit"]'),
};

let displayTotal = 0;
let totalAnimFrame = 0;

setupThemeToggle();
setupRevealObserver();
setupStickyHeader();
hydrateStateFromHash();
bindEvents();
render(true);

function setupThemeToggle() {
  const root = document.documentElement;
  const buttons = document.querySelectorAll('[data-set-theme]');
  if (!buttons.length) return;
  const STORAGE_KEY = 'uwu-theme';

  const getStored = () => {
    try {
      const v = localStorage.getItem(STORAGE_KEY);
      return v === 'light' || v === 'dark' || v === 'auto' ? v : 'auto';
    } catch (_) {
      return 'auto';
    }
  };

  const setStored = (v) => {
    try {
      localStorage.setItem(STORAGE_KEY, v);
    } catch (_) {}
  };

  const apply = (theme) => {
    root.setAttribute('data-theme', theme);
    buttons.forEach((b) => {
      b.setAttribute('aria-checked', String(b.dataset.setTheme === theme));
    });
  };

  buttons.forEach((b) => {
    b.addEventListener('click', () => {
      const value = b.dataset.setTheme;
      if (!value) return;
      setStored(value);
      apply(value);
    });
  });

  apply(getStored());
}

function setupRevealObserver() {
  const nodes = document.querySelectorAll('.reveal');
  if (!nodes.length) return;

  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-in');
          io.unobserve(entry.target);
        }
      }
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.08 });
    nodes.forEach((node) => io.observe(node));
    return;
  }

  nodes.forEach((node) => node.classList.add('is-in'));
}

function setupStickyHeader() {
  const header = document.querySelector('.site-header');
  if (!header) return;
  const onScroll = () => header.classList.toggle('is-scrolled', window.scrollY > 8);
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });
}

function bindEvents() {
  refs.cards.forEach((card) => {
    card.addEventListener('click', () => {
      if (card.classList.contains('is-disabled')) return;
      const group = card.dataset.group;
      const value = card.dataset.value;
      if (!group || !value) return;
      state[group] = value;
      normalizeState();
      render();
    });
  });

  refs.dayButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      if (state.length !== 'full') return;
      const currentDays = Number(state.days) || 1;
      if (btn.dataset.day === 'inc') state.days = currentDays + 1;
      if (btn.dataset.day === 'dec') state.days = currentDays - 1;
      normalizeState();
      render();
    });
  });

  if (refs.copyQuote) {
    refs.copyQuote.addEventListener('click', async () => {
      const text = buildQuoteText().body;
      try {
        await navigator.clipboard.writeText(text);
        refs.copyQuote.textContent = 'Copied';
        window.setTimeout(() => {
          refs.copyQuote.textContent = 'Copy summary';
        }, 1400);
      } catch (_) {
        refs.copyQuote.textContent = 'Copy failed';
      }
    });
  }

  const handleMailto = (event) => {
    event.preventDefault();
    const payload = buildQuoteText();
    const mailto = `mailto:hi@uwu.vision?subject=${encodeURIComponent(payload.subject)}&body=${encodeURIComponent(payload.body)}`;
    window.location.href = mailto;
  };

  if (refs.emailQuote) refs.emailQuote.addEventListener('click', handleMailto);
  if (refs.mobileEmail) refs.mobileEmail.addEventListener('click', handleMailto);

  if (refs.mobileToggle && refs.mobileQuote && refs.mobilePanel) {
    refs.mobileToggle.addEventListener('click', () => {
      const isOpen = refs.mobileQuote.classList.toggle('is-open');
      refs.mobilePanel.hidden = !isOpen;
      refs.mobileToggle.setAttribute('aria-expanded', String(isOpen));
    });
  }
}

function normalizeState() {
  if (state.tier !== 'commercial' && state.tier !== 'academic') state.tier = DEFAULT_STATE.tier;
  if (state.length !== 'full' && state.length !== 'half') state.length = DEFAULT_STATE.length;
  if (state.audio !== 'yes' && state.audio !== 'no') state.audio = DEFAULT_STATE.audio;
  if (state.grade !== 'yes' && state.grade !== 'no') state.grade = DEFAULT_STATE.grade;
  if (state.edit !== 'yes' && state.edit !== 'byo') state.edit = DEFAULT_STATE.edit;
  if (state.delivery !== 'finished' && state.delivery !== 'raw') state.delivery = DEFAULT_STATE.delivery;
  if (!Object.hasOwn(STORAGE, state.storage)) state.storage = DEFAULT_STATE.storage;

  const parsedDays = Number(state.days);
  state.days = Number.isFinite(parsedDays) ? Math.min(60, Math.max(1, Math.round(parsedDays))) : 1;
  if (state.length === 'half') state.days = 1;

  if (state.edit === 'byo') state.delivery = 'raw';
}

function getDayCount() {
  return state.length === 'full' ? state.days : 1;
}

function getMultiDayPct() {
  if (state.length !== 'full') return 0;
  const pct = ((getDayCount() - 1) * 20) / 13;
  return Math.min(20, Math.max(0, pct));
}

function getBreakdown() {
  const rates = RATES[state.tier];
  const days = getDayCount();
  const captureUnit = state.length === 'full' ? rates.captureFullDay : rates.captureHalfDay;
  const gradeUnit = state.length === 'full' ? rates.gradeFullDay : rates.gradeHalfDay;
  const editUnit = state.length === 'full' ? rates.editFullDay : rates.editHalfDay;
  const capture = captureUnit * days;
  const grade = state.grade === 'yes' ? gradeUnit * days : 0;
  const edit = state.edit === 'yes' ? editUnit * days : 0;
  const storage = STORAGE[state.storage];

  const multidayPct = getMultiDayPct();
  const baseForMultiday = capture + grade + edit;
  const multidayDiscount = Math.round(baseForMultiday * (multidayPct / 100));
  const audioDiscount = state.audio === 'no'
    ? (state.length === 'full' ? AUDIO_DISCOUNT_PER_FULLDAY * days : Math.round(AUDIO_DISCOUNT_PER_FULLDAY / 2))
    : 0;

  const subtotal = capture + grade + edit + storage;
  const total = subtotal - multidayDiscount - audioDiscount;

  const labels = {
    tier: state.tier === 'commercial' ? 'Commercial' : 'Academic / Research',
    length: state.length === 'full' ? 'Full day' : 'Half day',
    storage: state.storage === 'ssd'
      ? 'Samsung T9 4TB SSD'
      : state.storage === 'module'
        ? 'Blackmagic 8TB Module'
        : 'BYO storage',
  };

  return {
    days,
    labels,
    capture,
    grade,
    edit,
    storage,
    multidayPct,
    multidayDiscount,
    audioDiscount,
    total,
  };
}

function render(isInitial = false) {
  normalizeState();
  const breakdown = getBreakdown();

  refs.cards.forEach((card) => {
    const selected = state[card.dataset.group] === card.dataset.value;
    card.classList.toggle('is-selected', selected);
  });

  const finishedCard = refs.cards.find((card) => card.dataset.group === 'delivery' && card.dataset.value === 'finished');
  if (finishedCard) {
    const disabled = state.edit === 'byo';
    finishedCard.classList.toggle('is-disabled', disabled);
    finishedCard.setAttribute('aria-disabled', String(disabled));
  }

  if (refs.dayCounter) refs.dayCounter.hidden = state.length !== 'full';
  if (refs.dayValue) refs.dayValue.textContent = `${breakdown.days} ${breakdown.days > 1 ? 'days' : 'day'}`;
  if (refs.discountPill) refs.discountPill.textContent = `-${breakdown.multidayPct.toFixed(1)}%`;
  if (refs.byoNote) refs.byoNote.hidden = state.edit !== 'byo';

  if (refs.priceCaptureHalf) refs.priceCaptureHalf.textContent = `AUD ${formatInt(RATES[state.tier].captureHalfDay)}`;
  if (refs.priceCaptureFull) refs.priceCaptureFull.textContent = `AUD ${formatInt(RATES[state.tier].captureFullDay)}`;
  const unitLabel = state.length === 'full' ? 'day' : 'half day';
  if (refs.priceGrade) refs.priceGrade.textContent = `AUD ${formatInt(state.length === 'full' ? RATES[state.tier].gradeFullDay : RATES[state.tier].gradeHalfDay)} / ${unitLabel}`;
  if (refs.priceEdit) refs.priceEdit.textContent = `AUD ${formatInt(state.length === 'full' ? RATES[state.tier].editFullDay : RATES[state.tier].editHalfDay)} / ${unitLabel}`;

  const lineItems = [];
  lineItems.push({
    label: `Capture — ${breakdown.labels.tier} ${breakdown.labels.length} × ${breakdown.days}`,
    value: breakdown.capture,
  });
  if (state.grade === 'yes') lineItems.push({ label: `Grade & finishing × ${breakdown.days}`, value: breakdown.grade });
  if (state.edit === 'yes') lineItems.push({ label: `Editing × ${breakdown.days}`, value: breakdown.edit });
  if (state.storage !== 'byo') lineItems.push({ label: `Storage — ${breakdown.labels.storage}`, value: breakdown.storage });

  const discounts = [];
  if (breakdown.multidayDiscount > 0) discounts.push({ label: `Multi-day discount (${breakdown.multidayPct.toFixed(1)}%)`, value: breakdown.multidayDiscount });
  if (breakdown.audioDiscount > 0) discounts.push({ label: 'No spatial audio', value: breakdown.audioDiscount });

  renderRows(refs.quoteLines, lineItems, false);
  renderRows(refs.mobileLines, lineItems, false);

  if (refs.quoteDiscounts) {
    refs.quoteDiscounts.hidden = discounts.length === 0;
    renderRows(refs.quoteDiscounts, discounts, true);
  }
  if (refs.mobileDiscounts) {
    refs.mobileDiscounts.hidden = discounts.length === 0;
    renderRows(refs.mobileDiscounts, discounts, true);
  }

  animateTotalTo(breakdown.total, isInitial);
  syncHash();
}

function renderRows(target, rows, isDiscount) {
  if (!target) return;
  const className = isDiscount ? 'quote-discount-line' : 'quote-line';
  const labelClass = isDiscount ? 'quote-discount-label' : 'quote-line-label';
  const valueClass = isDiscount ? 'quote-discount-value' : 'quote-line-value';
  target.innerHTML = rows.map((row) => {
    const prefix = isDiscount ? '- ' : '';
    return `<li class="${className} quote-flash"><span class="${labelClass}">${escapeHtml(row.label)}</span><span class="${valueClass}">${prefix}AUD ${formatInt(row.value)}</span></li>`;
  }).join('');
}

function animateTotalTo(nextTotal, isInitial) {
  if (isInitial) {
    displayTotal = nextTotal;
    writeTotals(nextTotal);
    return;
  }
  if (totalAnimFrame) cancelAnimationFrame(totalAnimFrame);

  const start = displayTotal;
  const diff = nextTotal - start;
  const startTime = performance.now();
  const duration = 320;

  const tick = (now) => {
    const t = Math.min(1, (now - startTime) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    const val = Math.round(start + diff * eased);
    displayTotal = val;
    writeTotals(val);
    if (t < 1) totalAnimFrame = requestAnimationFrame(tick);
  };
  totalAnimFrame = requestAnimationFrame(tick);
}

function writeTotals(value) {
  const label = `AUD ${formatInt(value)}`;
  if (refs.total) refs.total.textContent = label;
  if (refs.mobileTotal) refs.mobileTotal.textContent = label;
}

function syncHash() {
  const params = new URLSearchParams();
  params.set('t', state.tier === 'commercial' ? 'com' : 'acad');
  params.set('l', state.length === 'full' ? 'full' : 'half');
  params.set('d', String(getDayCount()));
  params.set('a', state.audio === 'yes' ? 'y' : 'n');
  params.set('g', state.grade === 'yes' ? 'y' : 'n');
  params.set('e', state.edit === 'yes' ? 'y' : 'b');
  params.set('dv', state.delivery === 'finished' ? 'fin' : 'raw');
  params.set('s', state.storage);
  const hash = `#${params.toString()}`;
  if (location.hash !== hash) history.replaceState(null, '', hash);
}

function hydrateStateFromHash() {
  const raw = location.hash.replace(/^#/, '');
  if (!raw) return;
  const params = new URLSearchParams(raw);
  if (params.get('t') === 'com') state.tier = 'commercial';
  if (params.get('t') === 'acad') state.tier = 'academic';
  if (params.get('l') === 'full') state.length = 'full';
  if (params.get('l') === 'half') state.length = 'half';
  if (params.get('d')) state.days = Number(params.get('d'));
  if (params.get('a') === 'y') state.audio = 'yes';
  if (params.get('a') === 'n') state.audio = 'no';
  if (params.get('g') === 'y') state.grade = 'yes';
  if (params.get('g') === 'n') state.grade = 'no';
  if (params.get('e') === 'y') state.edit = 'yes';
  if (params.get('e') === 'b') state.edit = 'byo';
  if (params.get('dv') === 'fin') state.delivery = 'finished';
  if (params.get('dv') === 'raw') state.delivery = 'raw';
  if (params.get('s')) state.storage = params.get('s');
}

function buildQuoteText() {
  const data = getBreakdown();
  const shareUrl = `${location.origin}${location.pathname}${location.hash}`;
  const lines = [
    `Tier: ${data.labels.tier}`,
    `Shoot: ${data.labels.length} x ${data.days}`,
    `Spatial audio: ${state.audio === 'yes' ? 'Yes' : 'No'}`,
    `Grade: ${state.grade === 'yes' ? 'Included' : 'Not included'}`,
    `Editing: ${state.edit === 'yes' ? 'Included' : 'BYO editing'}`,
    `Delivery: ${state.delivery === 'finished' ? 'Finished files' : 'RAW files (archival)'}`,
    `Storage: ${data.labels.storage}`,
    '',
    `Estimated total: AUD ${formatInt(data.total)}`,
    '',
    'Includes camera operator and assistant.',
    'Indicative pricing only.',
    '',
    `Shareable quote: ${shareUrl}`,
  ];
  return {
    subject: `uwu.vision quote estimate — AUD ${formatInt(data.total)}`,
    body: lines.join('\n'),
  };
}

function formatInt(value) {
  return new Intl.NumberFormat('en-AU', { maximumFractionDigits: 0 }).format(value);
}

function escapeHtml(str) {
  return str
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
