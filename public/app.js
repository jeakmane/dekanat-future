/* Деканат будущего — логика SPA */
'use strict';

// ---------- Утилиты ----------
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function fmtDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
}
function fmtDateFull(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}
function daysUntil(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const now = new Date(); now.setHours(0, 0, 0, 0);
  return Math.round((new Date(y, m - 1, d) - now) / 86400000);
}
function plural(n, one, few, many) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    credentials: 'same-origin',
    headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
    ...options
  });
  let data = null;
  try { data = await res.json(); } catch { /* пустой ответ */ }
  if (!res.ok) {
    const err = new Error(data?.error || 'Ошибка сервера');
    err.status = res.status;
    throw err;
  }
  return data;
}

function toast(msg) {
  const root = $('#toast-root');
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  root.append(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; }, 2400);
  setTimeout(() => el.remove(), 2800);
}

function skeletons(n = 3) {
  return Array.from({ length: n }, () =>
    '<div class="skeleton sk-card" aria-hidden="true"></div>').join('') +
    '<p class="muted" role="status">Загружаем…</p>';
}

function emptyState(text, hint) {
  return `<div class="empty-state">
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 15h-2v-6h2zm0-8h-2V7h2z"/></svg>
    <p><strong>${esc(text)}</strong></p>
    ${hint ? `<p>${esc(hint)}</p>` : ''}
  </div>`;
}

// ---------- Состояние ----------
const state = {
  user: null,
  unread: 0,
  weekOffset: 0,
  clockTimer: null
};

// Часы по МСК на главной (обновляются каждые полминуты)
function startClock() {
  const el = $('#msk-clock');
  if (!el) return;
  const fmt = new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Europe/Moscow',
    weekday: 'long', day: 'numeric', month: 'long',
    hour: '2-digit', minute: '2-digit'
  });
  const tick = () => { el.textContent = fmt.format(new Date()) + ' мск'; };
  tick();
  state.clockTimer = setInterval(tick, 30_000);
}

function updateBadges() {
  const top = $('#top-badge'), mobile = $('#mobile-badge');
  const has = state.unread > 0;
  top.hidden = !has;
  mobile.hidden = !has;
  if (has) top.textContent = state.unread > 9 ? '9+' : state.unread;
}

// ---------- Роутинг ----------
const routes = {
  home: renderHome,
  schedule: renderSchedule,
  grades: renderGrades,
  requests: renderRequests,
  notifications: renderNotifications,
  profile: renderProfile,
  staff: renderStaff
};

function currentRoute() {
  const hash = location.hash.replace('#', '');
  if (state.user?.role === 'staff') return 'staff';
  return routes[hash] ? hash : 'home';
}

async function navigate() {
  const route = currentRoute();
  const view = $('#view');
  if (state.clockTimer) { clearInterval(state.clockTimer); state.clockTimer = null; }
  $$('.top-nav a, .bottom-nav a').forEach(a => {
    const active = a.dataset.nav === route ||
      (route === 'staff' && a.dataset.nav === 'home');
    if (active) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  view.innerHTML = skeletons(3);
  try {
    await routes[route](view);
  } catch (e) {
    if (e.status === 401) return showLogin();
    view.innerHTML = `<div class="card">${emptyState('Не получилось загрузить раздел', 'Проверьте соединение и попробуйте ещё раз.')}
      <button class="btn btn-primary btn-block" id="retry">Повторить</button></div>`;
    $('#retry').addEventListener('click', navigate);
    return;
  }
  view.focus({ preventScroll: true });
  window.scrollTo({ top: 0 });
}

// ---------- Главная ----------
async function renderHome(view) {
  const d = await api('/api/dashboard');
  const name = esc(state.user.profile.fullName.split(' ')[1] || state.user.profile.fullName);
  const hour = new Date().getHours();
  const greet = hour < 5 ? 'Доброй ночи' : hour < 12 ? 'Доброе утро' : hour < 18 ? 'Добрый день' : 'Добрый вечер';

  let sessionHtml = '';
  if (d.session) {
    const days = daysUntil(d.session.examsStart);
    sessionHtml = days > 0
      ? `<div class="stat"><div class="stat-value">${days}</div><div class="stat-label">${plural(days, 'день', 'дня', 'дней')} до сессии · с ${fmtDate(d.session.examsStart)}</div></div>`
      : `<div class="stat"><div class="stat-value">Идёт</div><div class="stat-label">Сессия до ${fmtDate(d.session.examsEnd)}</div></div>`;
  }

  const todayLessons = d.today?.lessons || [];
  const nowTime = d.nowTime || '23:59';
  // Ближайшая = ещё не закончившаяся сегодня и не отменённая
  const nextLesson = todayLessons.find(l => l.end > nowTime && l.change?.kind !== 'отмена');
  const inProgress = nextLesson && nextLesson.start <= nowTime;
  const gpaPct = d.gpa ? Math.round((d.gpa / 5) * 100) : 0;

  view.innerHTML = `
    <div class="card greeting">
      <h2>${greet}, ${name}!</h2>
      <p class="muted">${esc(state.user.profile.group)} · ${esc(state.user.profile.faculty)}</p>
      <p class="muted" id="msk-clock" style="margin:.15rem 0 0"></p>
      ${nextLesson
        ? `<p style="margin:.6rem 0 0">${inProgress
            ? `Сейчас идёт: <strong>${esc(nextLesson.subject)}</strong>, до ${esc(nextLesson.end)}, ауд. ${esc(nextLesson.room)}`
            : `Ближайшая пара: <strong>${esc(nextLesson.subject)}</strong> в ${esc(nextLesson.start)}, ауд. ${esc(nextLesson.room)}`}</p>`
        : '<p style="margin:.6rem 0 0">На сегодня пар нет — можно выдохнуть.</p>'}
    </div>

    ${d.priorities?.length ? `
    <div class="card priority-card">
      <h3>Что мне сейчас нужно</h3>
      ${d.priorities.map(p => `
        <a class="priority-item" href="${esc(p.link)}">
          <span class="priority-icon priority-${esc(p.kind)}">${NOTIF_ICONS[p.kind] || NOTIF_ICONS.news}</span>
          <span>
            <span class="priority-title">${esc(p.title)}</span>
            <span class="priority-text">${esc(p.text)}</span>
          </span>
        </a>`).join('')}
    </div>` : ''}

    <div class="stat-row">
      <div class="stat">
        <div class="ring-wrap">
          <svg class="ring" viewBox="0 0 72 72" role="img" aria-label="Средний балл ${d.gpa ?? '—'} из 5">
            <circle class="ring-bg" cx="36" cy="36" r="30"></circle>
            <circle class="ring-fg" cx="36" cy="36" r="30"
              stroke-dasharray="${(2 * Math.PI * 30).toFixed(1)}"
              stroke-dashoffset="${(2 * Math.PI * 30 * (1 - gpaPct / 100)).toFixed(1)}"></circle>
            <text x="36" y="41" text-anchor="middle">${d.gpa ?? '—'}</text>
          </svg>
          <div><div class="stat-label">Средний балл</div><div class="muted" style="font-size:.8rem">по всем семестрам</div></div>
        </div>
      </div>
      ${sessionHtml}
      <a class="stat" href="#requests" style="text-decoration:none;color:inherit">
        <div class="stat-value">${d.activeRequests}</div>
        <div class="stat-label">${plural(d.activeRequests, 'активная заявка', 'активные заявки', 'активных заявок')}</div>
      </a>
      <a class="stat" href="#notifications" style="text-decoration:none;color:inherit">
        <div class="stat-value">${d.unreadNotifications}</div>
        <div class="stat-label">${plural(d.unreadNotifications, 'новое уведомление', 'новых уведомления', 'новых уведомлений')}</div>
      </a>
    </div>

    <div class="card">
      <h3>Быстрые действия</h3>
      <div class="grid grid-3" style="gap:.6rem">
        <a class="btn btn-ghost" href="#schedule">Расписание на неделю</a>
        <a class="btn btn-ghost" href="#requests">Заказать справку</a>
        <a class="btn btn-ghost" href="#grades">Мои оценки</a>
      </div>
    </div>

    <div class="card">
      <h3>Сегодня</h3>
      ${d.today ? renderLessons(todayLessons) : ''}
    </div>`;

  startClock();
}

// ---------- Расписание ----------
function renderLessons(lessons) {
  if (!lessons.length) return '<p class="day-empty">Занятий нет — свободный день.</p>';
  return lessons.map(l => {
    const cancelled = l.change?.kind === 'отмена';
    return `<div class="lesson">
      <div class="lesson-time">${esc(l.start)}<small>${esc(l.end)}</small></div>
      <div>
        <div class="lesson-name" ${cancelled ? 'style="text-decoration:line-through;color:var(--muted)"' : ''}>${esc(l.subject)}</div>
        <div class="lesson-meta">
          <span class="chip chip-type">${esc(l.type)}</span>
          ${esc(l.teacher)} · ауд. ${esc(l.room)}
        </div>
        ${l.change ? `<div class="change-note"><span class="chip ${cancelled ? 'chip-cancel' : 'chip-change'}">${esc(l.change.kind)}</span> ${esc(l.change.note)}</div>` : ''}
      </div>
    </div>`;
  }).join('');
}

async function renderSchedule(view) {
  const data = await api('/api/schedule?week=' + state.weekOffset);
  const weekLabel = state.weekOffset === 0 ? 'Текущая неделя' :
    state.weekOffset === 1 ? 'Следующая неделя' :
    state.weekOffset === -1 ? 'Прошлая неделя' :
    `Неделя с ${fmtDate(data.weekStart)}`;

  view.innerHTML = `
    <div class="page-head"><h2>Расписание</h2><p class="muted">Группа ${esc(state.user.profile.group)}</p></div>
    <div class="week-switch">
      <button class="btn btn-ghost" id="prev-week" aria-label="Предыдущая неделя">← Назад</button>
      <strong>${esc(weekLabel)}</strong>
      <button class="btn btn-ghost" id="next-week" aria-label="Следующая неделя">Вперёд →</button>
    </div>
    ${data.days.map(day => `
      <div class="card day-block">
        <div class="day-head">
          <h3>${esc(day.weekday)}</h3>
          <span class="muted">${fmtDate(day.date)}</span>
          ${day.isToday ? '<span class="day-today">сегодня</span>' : ''}
        </div>
        ${renderLessons(day.lessons)}
      </div>`).join('')}`;

  $('#prev-week').addEventListener('click', () => { state.weekOffset = Math.max(-4, state.weekOffset - 1); navigate(); });
  $('#next-week').addEventListener('click', () => { state.weekOffset = Math.min(4, state.weekOffset + 1); navigate(); });

  // Свайп влево/вправо листает недели (удобно с телефона)
  let touchX = null, touchY = null;
  view.addEventListener('touchstart', e => {
    touchX = e.touches[0].clientX;
    touchY = e.touches[0].clientY;
  }, { passive: true });
  view.addEventListener('touchend', e => {
    if (touchX === null) return;
    const dx = e.changedTouches[0].clientX - touchX;
    const dy = e.changedTouches[0].clientY - touchY;
    touchX = touchY = null;
    // Только явный горизонтальный свайп, чтобы не мешать вертикальному скроллу
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 2) {
      const next = state.weekOffset + (dx < 0 ? 1 : -1);
      if (next >= -4 && next <= 4) {
        state.weekOffset = next;
        navigate();
      }
    }
  }, { passive: true });
}

// ---------- Успеваемость ----------
async function renderGrades(view) {
  const data = await api('/api/grades');
  const current = data.semesters.find(s => s.current);
  const past = data.semesters.filter(s => !s.current);

  const PART_COLORS = ['#8b5cf6', '#3b82f6', '#22c55e', '#ec4899', '#f59e0b'];

  // Прогноз итоговой оценки по текущей сумме баллов БРС
  const predict = s => {
    if (s.kind === 'зачёт') {
      return s.points >= 50
        ? { text: 'Прогноз: зачёт', next: null }
        : { text: 'Пока ниже порога зачёта', next: `До зачёта нужно ещё ${50 - s.points}` };
    }
    const mark = s.points >= 80 ? 5 : s.points >= 60 ? 4 : s.points >= 40 ? 3 : null;
    const next = [[80, '5'], [60, '4'], [40, '3']].find(([v]) => v > s.points);
    return {
      text: mark ? `Прогноз на экзамене: «${mark}»` : 'Пока ниже «3»',
      next: next ? `До «${next[1]}» нужно ещё ${next[0] - s.points}` : null
    };
  };

  const subjectRow = s => {
    const pct = Math.round((s.points / s.max) * 100);
    let mark = '';
    if (s.mark === null) mark = `<span class="muted" style="font-size:.85rem">${s.points} из ${s.max}</span>`;
    else if (typeof s.mark === 'number') mark = `<span class="mark mark-${s.mark}">${s.mark}</span>`;
    else mark = `<span class="mark-pass">зачёт</span>`;

    const head = `<div class="subject-row-head">
        <div>
          <div style="font-weight:650">${esc(s.name)}</div>
          <div class="muted" style="font-size:.8rem">${esc(s.kind)}</div>
        </div>
        ${mark}
        <div class="progress-bar" role="img" aria-label="Набрано ${pct} процентов баллов"><span style="inline-size:${pct}%"></span></div>
      </div>`;

    // Дисциплина без разбивки (прошлые семестры) — простая строка
    if (!s.parts) return `<div class="subject-row">${head}</div>`;

    const p = predict(s);
    const isZachet = s.kind === 'зачёт';
    const markers = isZachet ? [[50, 'зачёт']] : [[40, '3'], [60, '4'], [80, '5']];
    const scaleLabel = isZachet
      ? `Шкала: зачёт от 50 баллов. Набрано ${s.points} из ${s.max}`
      : `Шкала: «3» от 40, «4» от 60, «5» от 80 баллов. Набрано ${s.points} из ${s.max}`;
    return `<details class="subject-details">
      <summary>${head}</summary>
      <div class="subject-detail">
        <div class="detail-total">
          <div class="detail-total-value">${s.points}</div>
          <div>
            <div class="muted" style="font-size:.82rem">из ${s.max} баллов БРС</div>
            <div class="predict">${esc(p.text)}${p.next ? ` · ${esc(p.next)}` : ''}</div>
          </div>
        </div>
        <div class="grade-scale" role="img" aria-label="${scaleLabel}">
          <div class="scale-marks">
            ${markers.map(([v, l]) => `<div class="scale-mark" style="inset-inline-start:${(v / s.max * 100).toFixed(1)}%"><b>${l}</b><i>${v}</i></div>`).join('')}
          </div>
          <div class="scale-track"><span class="scale-fill" style="inline-size:${pct}%"></span></div>
        </div>
        <div class="parts-grid">
          ${s.parts.map((part, i) => `
            <div class="part" style="--part-color:${PART_COLORS[i % PART_COLORS.length]}">
              <div class="part-label">${esc(part.label)}</div>
              <div class="part-value">${part.points} из ${part.max}</div>
            </div>`).join('')}
        </div>
      </div>
    </details>`;
  };

  view.innerHTML = `
    <div class="page-head"><h2>Успеваемость</h2><p class="muted">Средний балл: <strong>${data.gpa ?? '—'}</strong></p></div>
    ${current ? `<div class="card"><h3>${esc(current.name)}</h3>
      <p class="muted" style="margin-top:-.4rem;font-size:.85rem">Балльно-рейтинговая система, до 120 баллов: «5» от 80, «4» от 60, «3» от 40, зачёт — от 50. Нажмите на дисциплину — увидите, за что начислены баллы, и прогноз оценки.</p>
      ${current.subjects.map(subjectRow).join('')}</div>` : ''}
    ${past.map(sem => `
      <details class="card semester-details">
        <summary>${esc(sem.name)}</summary>
        ${sem.subjects.map(subjectRow).join('')}
      </details>`).join('')}
    ${!data.semesters.length ? `<div class="card">${emptyState('Оценок пока нет', 'Они появятся после первых контрольных точек.')}</div>` : ''}`;
}

// ---------- Заявки ----------
const STATUS_META = {
  new: { label: 'Принята', chip: 'chip-type', step: 0 },
  in_progress: { label: 'В работе', chip: 'chip-change', step: 1 },
  ready: { label: 'Готова', chip: 'chip-success', step: 2 },
  rejected: { label: 'Отклонена', chip: 'chip-cancel', step: -1 }
};
const STATUS_STEPS = ['Принята', 'В работе', 'Готова'];

function requestCard(r) {
  const st = STATUS_META[r.status] || STATUS_META.new;
  const steps = STATUS_STEPS.map((label, i) => {
    const cls = i < st.step ? 'done' : i === st.step ? 'current' : '';
    const hist = r.history[i];
    return `<li class="${cls}">${label}${hist ? ` · ${fmtDate(hist.at)}` : ''}</li>`;
  }).join('');
  return `<div class="card request-card">
    <div class="request-top">
      <div>
        <div class="request-title">${esc(r.title)}</div>
        <div class="muted" style="font-size:.82rem">подана ${fmtDateFull(r.createdAt)}</div>
      </div>
      <span class="chip ${st.chip}">${st.label}</span>
    </div>
    ${r.comment ? `<p style="margin:.2rem 0 0">${esc(r.comment)}</p>` : ''}
    ${r.status === 'ready' && r.pickup ? `<div class="change-note" style="color:var(--success);background:color-mix(in srgb, var(--success) 9%, var(--surface))">Можно забрать: ${esc(r.pickup)}</div>` : ''}
    <ol class="timeline">${steps}</ol>
  </div>`;
}

async function renderRequests(view) {
  const data = await api('/api/requests');
  const active = data.requests.filter(r => r.status !== 'ready' && r.status !== 'rejected');
  const done = data.requests.filter(r => r.status === 'ready' || r.status === 'rejected');

  view.innerHTML = `
    <div class="page-head"><h2>Заявки и справки</h2><p class="muted">Без очередей: подал онлайн — отследил статус — забрал готовое</p></div>

    <div class="card">
      <h3>Новая заявка</h3>
      <form id="new-request" method="post">
        <div class="field">
          <label for="req-type">Что нужно</label>
          <select id="req-type" name="type" required>
            ${Object.entries(data.types).map(([v, label]) => `<option value="${esc(v)}">${esc(label)}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label for="req-comment">Комментарий <span class="muted" style="font-weight:400">(необязательно)</span></label>
          <textarea id="req-comment" name="comment" maxlength="500" placeholder="Например: для банка, 2 экземпляра"></textarea>
        </div>
        <button type="submit" class="btn btn-primary btn-block" id="req-submit">Подать заявку</button>
      </form>
    </div>

    ${active.length ? `<h3 style="margin:.4rem 0 .8rem">Активные</h3>${active.map(requestCard).join('')}` : ''}
    ${done.length ? `<details class="card semester-details"><summary>Завершённые (${done.length})</summary>${done.map(requestCard).join('')}</details>` : ''}
    ${!data.requests.length ? `<div class="card">${emptyState('Заявок пока нет', 'Закажите первую справку — это займёт секунд 20.')}</div>` : ''}`;

  $('#new-request').addEventListener('submit', async e => {
    e.preventDefault();
    const btn = $('#req-submit');
    btn.disabled = true;
    try {
      await api('/api/requests', {
        method: 'POST',
        body: JSON.stringify({
          type: $('#req-type').value,
          comment: $('#req-comment').value
        })
      });
      toast('Заявка подана. Деканат уже увидел её!');
      state.unread += 1; updateBadges();
      navigate();
    } catch (err) {
      toast(err.message);
      btn.disabled = false;
    }
  });
}

// ---------- Уведомления ----------
const NOTIF_ICONS = {
  deadline: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 10.6 4 2.4-.8 1.3L11 13.5V7h2z"/></svg>',
  schedule: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 2v2H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2V2h-2v2H9V2zM5 9h14v10H5z"/></svg>',
  news: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zm2 4v2h12V8zm0 4v2h12v-2zm0 4v2h8v-2z"/></svg>',
  request: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h9l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm8 1.5V8h4.5zM8 12h8v2H8zm0 4h8v2H8z"/></svg>',
  session: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 1 9l4 2.2V16c0 2.2 3.1 4 7 4s7-1.8 7-4v-4.8L21 10.4V16h2V9zm7 15a3 3 0 0 1-3 3h-8a3 3 0 0 1-3-3v-3.2l7 3.9 7-3.9z"/></svg>'
};

async function renderNotifications(view) {
  const data = await api('/api/notifications');
  const list = data.notifications;

  view.innerHTML = `
    <div class="page-head">
      <h2>Уведомления</h2>
      <p class="muted">Новости деканата, дедлайны и изменения в расписании</p>
    </div>
    ${list.length ? `
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:.6rem;flex-wrap:wrap">
          <h3 style="margin:0">Лента</h3>
          <button class="btn btn-ghost" id="read-all" ${state.unread ? '' : 'disabled'}>Прочитать все</button>
        </div>
        ${list.map(n => `
          <div class="notif ${n.read ? '' : 'unread'}">
            <div class="notif-icon">${NOTIF_ICONS[n.kind] || NOTIF_ICONS.news}</div>
            <div>
              <div class="notif-title">${esc(n.title)}</div>
              <div style="font-size:.9rem">${esc(n.text)}</div>
              <div class="notif-date">${fmtDateFull(n.date)}</div>
            </div>
          </div>`).join('')}
      </div>` : `<div class="card">${emptyState('Пока тихо', 'Здесь появятся новости деканата и напоминания о дедлайнах.')}</div>`}`;

  const btn = $('#read-all');
  if (btn && state.unread) {
    btn.addEventListener('click', async () => {
      await api('/api/notifications/read', { method: 'POST', body: JSON.stringify({}) });
      state.unread = 0;
      updateBadges();
      navigate();
    });
  }
}

// ---------- Профиль ----------
async function renderProfile(view) {
  const p = state.user.profile;
  const rows = [
    ['Факультет', p.faculty],
    ['Направление', p.program],
    ['Курс', p.course],
    ['Группа', p.group],
    ['Зачётная книжка', p.recordBook],
    ['Почта', p.email],
    ['Телефон', p.phone]
  ];

  view.innerHTML = `
    <div class="page-head"><h2>Профиль</h2></div>
    <div class="card">
      <div class="profile-head">
        <div class="avatar" aria-hidden="true">${esc(p.avatar)}</div>
        <div>
          <div style="font-weight:750;font-size:1.15rem">${esc(p.fullName)}</div>
          <div class="muted">Студент · ${esc(p.group)}</div>
        </div>
      </div>
      <dl class="profile-rows">
        ${rows.map(([k, v]) => `<div class="row"><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}
      </dl>
    </div>

    <div class="card">
      <h3>Оформление</h3>
      <div style="display:flex;justify-content:space-between;align-items:center;gap:1rem;flex-wrap:wrap">
        <span class="muted">Тема интерфейса</span>
        <div class="seg" role="group" aria-label="Тема оформления">
          <button type="button" id="theme-auto" aria-pressed="false">Как в системе</button>
          <button type="button" id="theme-toggle" aria-pressed="false"></button>
        </div>
      </div>
    </div>

    <div class="card">
      <h3>Безопасность</h3>
      <p class="muted" style="margin:.2rem 0 .9rem;font-size:.9rem">
        Вы видите только свои данные — сервер отдаёт расписание, оценки и заявки строго владельцу сессии.
        Пароли хранятся в виде хешей и нигде не показываются.
      </p>
      <button class="btn btn-ghost btn-block" id="logout">Выйти из кабинета</button>
    </div>

    <p class="disclaimer">Концепт для конкурса «Цифровой деканат будущего». Не официальный сервис вуза. Все данные вымышленные.</p>`;

  initThemeControls();
  $('#logout').addEventListener('click', async () => {
    await api('/api/logout', { method: 'POST' });
    location.hash = '';
    showLogin();
    toast('Вы вышли. До встречи!');
  });
}

// ---------- Тема оформления (по гайду dark-mode-toggle) ----------
const metaScheme = document.querySelector('meta[name="color-scheme"]');
const systemDark = matchMedia('(prefers-color-scheme: dark)');

function storedTheme() {
  try { return localStorage.getItem('color-scheme'); } catch { return null; }
}
function renderedIsDark() {
  const stored = storedTheme();
  return stored ? stored === 'dark' : systemDark.matches;
}
function applyTheme(value) {
  metaScheme.content = value ?? 'light dark';
}

function initThemeControls() {
  const autoBtn = $('#theme-auto'), toggleBtn = $('#theme-toggle');
  if (!autoBtn || !toggleBtn) return;

  function sync() {
    const stored = storedTheme();
    autoBtn.setAttribute('aria-pressed', String(!stored));
    toggleBtn.setAttribute('aria-pressed', String(Boolean(stored)));
    const dark = renderedIsDark();
    toggleBtn.textContent = stored ? (stored === 'dark' ? 'Тёмная' : 'Светлая') : `Включить ${dark ? 'светлую' : 'тёмную'}`;
  }

  autoBtn.addEventListener('click', () => {
    try { localStorage.removeItem('color-scheme'); } catch { }
    applyTheme(null);
    sync();
  });

  toggleBtn.addEventListener('click', () => {
    const target = renderedIsDark() ? 'light' : 'dark';
    const systemNow = systemDark.matches ? 'dark' : 'light';
    try {
      if (target === systemNow) localStorage.removeItem('color-scheme');
      else localStorage.setItem('color-scheme', target);
    } catch { }
    applyTheme(storedTheme());
    sync();
  });

  sync();
}

window.addEventListener('storage', e => {
  if (e.key === 'color-scheme') applyTheme(storedTheme());
});

// ---------- Кабинет сотрудника ----------
async function renderStaff(view) {
  const data = await api('/api/staff/requests');
  const nextLabel = { new: 'Взять в работу', in_progress: 'Отметить готовой' };

  view.innerHTML = `
    <div class="page-head">
      <h2>Очередь заявок</h2>
      <p class="muted">${esc(state.user.profile.fullName)} · ${esc(state.user.profile.position)}</p>
    </div>
    <div class="card">
      ${data.requests.length ? data.requests.map(r => {
        const st = STATUS_META[r.status] || STATUS_META.new;
        const next = nextLabel[r.status];
        return `<div class="staff-row">
          <div style="display:flex;justify-content:space-between;gap:.8rem;align-items:flex-start">
            <div>
              <div style="font-weight:700">${esc(r.title)}</div>
              <div class="muted" style="font-size:.85rem">${esc(r.student?.name || '—')} · ${esc(r.student?.group || '')} · подана ${fmtDate(r.createdAt)}</div>
              ${r.comment ? `<div style="font-size:.9rem;margin-top:.2rem">«${esc(r.comment)}»</div>` : ''}
            </div>
            <span class="chip ${st.chip}">${st.label}</span>
          </div>
          ${next ? `<div><button class="btn btn-primary" data-advance="${esc(r.id)}">${next}</button></div>` : ''}
        </div>`;
      }).join('') : emptyState('Очередь пуста', 'Новые заявки появятся здесь сразу после подачи студентом.')}
    </div>
    <button class="btn btn-ghost btn-block" id="logout">Выйти</button>
    <p class="disclaimer">Концепт для конкурса. Все данные вымышленные.</p>`;

  $$('[data-advance]', view).forEach(btn => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        const r = data.requests.find(x => x.id === btn.dataset.advance);
        const flow = data.statusFlow;
        const next = flow[flow.indexOf(r.status) + 1];
        await api('/api/staff/requests/' + r.id, {
          method: 'PATCH',
          body: JSON.stringify({ status: next })
        });
        toast('Статус обновлён, студент получил уведомление');
        navigate();
      } catch (e) {
        toast(e.message);
        btn.disabled = false;
      }
    });
  });

  $('#logout').addEventListener('click', async () => {
    await api('/api/logout', { method: 'POST' });
    showLogin();
  });
}

// ---------- Вход / выход ----------
function showLogin() {
  state.user = null;
  document.body.classList.remove('is-staff');
  $('#app').hidden = true;
  $('#login-screen').hidden = false;
  $('#login').focus();
}

function showApp() {
  document.body.classList.toggle('is-staff', state.user?.role === 'staff');
  $('#login-screen').hidden = true;
  $('#app').hidden = false;
  navigate();
}

function initLogin() {
  const form = $('#login-form');
  const errBox = $('#login-error');
  const toggle = $('#toggle-password');
  const pwd = $('#password');

  toggle.addEventListener('click', () => {
    const show = pwd.type === 'password';
    pwd.type = show ? 'text' : 'password';
    toggle.setAttribute('aria-pressed', String(show));
    toggle.setAttribute('aria-label', show ? 'Скрыть пароль' : 'Показать пароль');
    pwd.focus();
  });

  form.addEventListener('submit', async e => {
    e.preventDefault();
    errBox.hidden = true;
    const btn = $('#login-submit');
    btn.disabled = true;
    btn.textContent = 'Входим…';
    try {
      const { user } = await api('/api/login', {
        method: 'POST',
        body: JSON.stringify({ login: $('#login').value, password: pwd.value })
      });
      state.user = user;
      const dash = await api('/api/dashboard').catch(() => null);
      state.unread = dash?.unreadNotifications ?? 0;
      updateBadges();
      showApp();
    } catch (err) {
      errBox.textContent = err.message;
      errBox.hidden = false;
      pwd.focus();
    } finally {
      btn.disabled = false;
      btn.textContent = 'Войти';
    }
  });
}

// ---------- Помощник деканата (чат) ----------
const chatState = { greeted: false };

function chatBubble(role, text) {
  const el = document.createElement('div');
  el.className = `chat-msg chat-msg-${role}`;
  el.textContent = text;
  return el;
}

function renderSuggestions(list) {
  const box = $('#chat-suggestions');
  box.innerHTML = '';
  (list || []).forEach(s => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chat-chip';
    btn.textContent = s;
    btn.addEventListener('click', () => sendChat(s));
    box.append(btn);
  });
}

async function sendChat(text) {
  const messages = $('#chat-messages');
  const input = $('#chat-input');
  renderSuggestions([]);
  messages.append(chatBubble('user', text));
  input.value = '';

  const typing = chatBubble('bot', 'Печатает…');
  typing.classList.add('chat-msg-typing');
  messages.append(typing);
  messages.scrollTop = messages.scrollHeight;

  try {
    const res = await api('/api/assistant', {
      method: 'POST',
      body: JSON.stringify({ message: text })
    });
    typing.textContent = res.reply;
    typing.classList.remove('chat-msg-typing');
    renderSuggestions(res.suggestions);
  } catch {
    typing.textContent = 'Не получилось ответить — проверьте соединение и спросите ещё раз.';
    typing.classList.remove('chat-msg-typing');
  }
  messages.scrollTop = messages.scrollHeight;
}

function initChat() {
  const fab = $('#chat-fab');
  const panel = $('#chat-panel');
  if (!fab || !panel) return;

  fab.addEventListener('click', () => {
    const opening = panel.hidden;
    panel.hidden = !opening;
    fab.setAttribute('aria-expanded', String(opening));
    if (opening) {
      if (!chatState.greeted) {
        chatState.greeted = true;
        const name = state.user?.profile?.fullName?.split(' ')[1] || '';
        $('#chat-messages').append(chatBubble('bot',
          `Привет${name ? ', ' + name : ''}! Я помощник деканата: подскажу расписание, статус заявок, баллы, дедлайны и сессию. Спрашивайте!`));
        renderSuggestions(['Какая следующая пара?', 'Что с моей заявкой?', 'Когда сессия?', 'Как дела с учёбой?']);
      }
      $('#chat-input').focus();
    }
  });

  $('#chat-close').addEventListener('click', () => {
    panel.hidden = true;
    fab.setAttribute('aria-expanded', 'false');
    fab.focus();
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !panel.hidden) {
      panel.hidden = true;
      fab.setAttribute('aria-expanded', 'false');
      fab.focus();
    }
  });

  $('#chat-form').addEventListener('submit', e => {
    e.preventDefault();
    const input = $('#chat-input');
    const text = input.value.trim();
    if (text) sendChat(text);
  });
}

// ---------- Старт ----------
window.addEventListener('hashchange', navigate);

// PWA: регистрируем service worker (офлайн-оболочка, «добавить на экран»)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => { /* приложение работает и без SW */ });
  });
}

(async function boot() {
  initLogin();
  initChat();
  try {
    const { user } = await api('/api/me');
    state.user = user;
    const dash = await api('/api/dashboard').catch(() => null);
    state.unread = dash?.unreadNotifications ?? 0;
    updateBadges();
    showApp();
  } catch {
    showLogin();
  }
})();
