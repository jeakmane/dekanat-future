/**
 * Цифровой деканат будущего — бэкенд прототипа.
 * Концепт для конкурса, все данные вымышленные.
 *
 * Безопасность:
 *  - пароли хранятся только как bcrypt-хеши (см. seed.js);
 *  - сессия в httpOnly+SameSite cookie, секрет берётся из env SESSION_SECRET;
 *  - каждая ручка отдаёт данные только владельца сессии — id студента
 *    никогда не принимается от клиента, поэтому «подставить чужой адрес»
 *    или чужой id не сработает;
 *  - мутации защищены SameSite=Strict + проверкой заголовка Origin.
 */
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');

const app = express();
// За reverse-прокси (Railway/Render/Amvera/Caddy) HTTPS терминируется на проксе.
// Без trust proxy express-session не выставляет Secure-cookie: соединение до
// приложения идёт по HTTP, и сессия «не сохраняется» после входа.
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'data', 'db.json');

// Автосидирование: на свежем деплое (Render/Railway/VPS) базы ещё нет —
// создаём вымышленные данные при первом старте, руками ничего не нужно.
if (!fs.existsSync(DB_FILE)) {
  console.log('[init] data/db.json не найден — генерирую демо-данные...');
  require('child_process').execSync('node seed.js', { cwd: __dirname, stdio: 'inherit' });
}

// ---------- «БД»: JSON-файл с записью на диск ----------
let db;
function loadDb() {
  db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}
function saveDb() {
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2), 'utf8');
  fs.renameSync(tmp, DB_FILE);
}
loadDb();

const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
if (!process.env.SESSION_SECRET) {
  console.warn('[warn] SESSION_SECRET не задан — сгенерирован временный. Для продакшена задайте переменную окружения.');
}

// ---------- Базовые заголовки безопасности ----------
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  next();
});

app.use(express.json({ limit: '20kb' }));
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.COOKIE_SECURE === '1',
    maxAge: 1000 * 60 * 60 * 8
  }
}));

// Анти-CSRF для мутаций: SameSite=Strict + проверка Origin (если он есть).
app.use((req, res, next) => {
  if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method)) {
    const origin = req.headers.origin;
    if (origin) {
      try {
        const host = new URL(origin).host;
        if (host !== req.headers.host) return res.status(403).json({ error: 'Недопустимый источник запроса' });
      } catch {
        return res.status(403).json({ error: 'Недопустимый источник запроса' });
      }
    }
  }
  next();
});

// ---------- Авторизация ----------
function requireAuth(req, res, next) {
  const user = db.users.find(u => u.id === req.session.userId);
  if (!user) return res.status(401).json({ error: 'Требуется вход' });
  req.user = user;
  next();
}
function requireStaff(req, res, next) {
  if (req.user.role !== 'staff') return res.status(403).json({ error: 'Доступ только для сотрудника деканата' });
  next();
}

function publicUser(u) {
  return { id: u.id, login: u.login, role: u.role, profile: u.profile };
}

// ---------- Auth API ----------
const loginAttempts = new Map(); // примитивный rate-limit по IP
app.post('/api/login', async (req, res) => {
  const ip = req.ip || 'unknown';
  const rec = loginAttempts.get(ip) || { count: 0, until: 0 };
  if (Date.now() < rec.until) {
    return res.status(429).json({ error: 'Слишком много попыток. Подождите минуту.' });
  }
  const { login, password } = req.body || {};
  if (typeof login !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'Введите логин и пароль' });
  }
  const user = db.users.find(u => u.login === login.trim().toLowerCase());
  const ok = user && await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    rec.count += 1;
    if (rec.count >= 5) { rec.until = Date.now() + 60_000; rec.count = 0; }
    loginAttempts.set(ip, rec);
    return res.status(401).json({ error: 'Неверный логин или пароль' });
  }
  loginAttempts.delete(ip);
  req.session.regenerate(err => {
    if (err) return res.status(500).json({ error: 'Ошибка сессии' });
    req.session.userId = user.id;
    res.json({ user: publicUser(user) });
  });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/api/me', requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

// ---------- Дашборд ----------
function daysBetween(aISO, bISO) {
  const [y1, m1, d1] = aISO.split('-').map(Number);
  const [y2, m2, d2] = bISO.split('-').map(Number);
  return Math.round((new Date(y2, m2 - 1, d2) - new Date(y1, m1 - 1, d1)) / 86400000);
}

const STATUS_LABELS = { new: 'принята', in_progress: 'в работе', ready: 'готова' };

// Виджет «Что мне сейчас нужно»: до трёх самых срочных дел студента
function buildPriorities(uid, sess) {
  const priorities = [];
  const unread = db.notifications.filter(n => n.userId === uid && !n.read);

  const deadline = unread.find(n => n.kind === 'deadline');
  if (deadline) {
    priorities.push({ kind: 'deadline', title: 'Дедлайн близко', text: deadline.text, link: '#notifications' });
  }
  const schedChange = unread.find(n => n.kind === 'schedule');
  if (schedChange) {
    priorities.push({ kind: 'schedule', title: 'Изменение в расписании', text: schedChange.text, link: '#schedule' });
  }
  const active = db.requests
    .filter(r => r.userId === uid && r.status !== 'ready' && r.status !== 'rejected')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  if (active) {
    priorities.push({
      kind: 'request',
      title: 'Заявка в работе',
      text: `«${active.title}» — статус: ${STATUS_LABELS[active.status]}. Деканат уже занимается ею.`,
      link: '#requests'
    });
  }
  if (sess) {
    const days = daysBetween(mskNow().date, sess.examsStart);
    if (days > 0 && days <= 14) {
      priorities.push({
        kind: 'session',
        title: 'Сессия приближается',
        text: `Осталось ${days} дн. — проверьте идущие баллы в «Успеваемости».`,
        link: '#grades'
      });
    }
  }
  return priorities.slice(0, 3);
}

app.get('/api/dashboard', requireAuth, (req, res) => {
  if (req.user.role === 'staff') {
    const queue = db.requests.filter(r => r.status !== 'ready' && r.status !== 'rejected');
    return res.json({ role: 'staff', queueCount: queue.length });
  }
  const uid = req.user.id;
  const sess = db.sessions[uid] || null;
  const g = db.grades[uid] || { gpa: null, semesters: [] };
  const unread = db.notifications.filter(n => n.userId === uid && !n.read).length;
  const activeRequests = db.requests.filter(r => r.userId === uid && r.status !== 'ready' && r.status !== 'rejected').length;
  res.json({
    role: 'student',
    gpa: g.gpa,
    session: sess,
    unreadNotifications: unread,
    activeRequests,
    priorities: buildPriorities(uid, sess),
    nowTime: mskNow().time,
    today: buildWeek(uid, 0).days.find(d => d.isToday) || null
  });
});

// ---------- Расписание ----------
// Текущие дата и время по Москве (независимо от часового пояса сервера)
function mskNow() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('ru-RU', {
      timeZone: 'Europe/Moscow',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false
    }).formatToParts(new Date()).map(p => [p.type, p.value])
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour === '24' ? '00' : parts.hour}:${parts.minute}`
  };
}

function mondayOf(date) {
  const d = new Date(date);
  const day = (d.getDay() + 6) % 7; // Пн=0
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
}
const fmtISO = d => {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
};

function buildWeek(userId, offsetWeeks) {
  const tpl = db.scheduleTemplates[userId] || {};
  const changes = db.scheduleChanges.filter(c => c.userId === userId);
  const monday = mondayOf(new Date());
  monday.setDate(monday.getDate() + offsetWeeks * 7);
  const todayISO = mskNow().date;
  const names = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];
  const days = [];
  for (let i = 0; i < 6; i++) {
    const date = new Date(monday);
    date.setDate(date.getDate() + i);
    const iso = fmtISO(date);
    const lessons = (tpl[i + 1] || []).map(l => {
      const change = changes.find(c => c.date === iso && c.lessonStart === l.start);
      return { ...l, change: change ? { kind: change.kind, note: change.note } : null };
    });
    days.push({
      weekday: names[i],
      date: iso,
      isToday: iso === todayISO,
      lessons
    });
  }
  return { weekStart: fmtISO(monday), days };
}

app.get('/api/schedule', requireAuth, (req, res) => {
  const offset = Math.max(-4, Math.min(4, parseInt(req.query.week, 10) || 0));
  res.json(buildWeek(req.user.id, offset));
});

// ---------- Успеваемость ----------
app.get('/api/grades', requireAuth, (req, res) => {
  res.json(db.grades[req.user.id] || { gpa: null, semesters: [] });
});

// ---------- Заявки ----------
const REQUEST_TYPES = {
  'spravka-study': 'Справка об обучении',
  'spravka-military': 'Справка в военкомат',
  'statement-retake': 'Заявление на пересдачу',
  'statement-academic': 'Заявление на академический отпуск'
};
const STATUS_FLOW = ['new', 'in_progress', 'ready'];

app.get('/api/requests', requireAuth, (req, res) => {
  const mine = db.requests
    .filter(r => r.userId === req.user.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  res.json({ types: REQUEST_TYPES, requests: mine });
});

app.post('/api/requests', requireAuth, (req, res) => {
  if (req.user.role !== 'student') return res.status(403).json({ error: 'Заявки подают студенты' });
  const { type, comment } = req.body || {};
  if (!REQUEST_TYPES[type]) return res.status(400).json({ error: 'Неизвестный тип заявки' });
  if (comment !== undefined && (typeof comment !== 'string' || comment.length > 500)) {
    return res.status(400).json({ error: 'Комментарий до 500 символов' });
  }
  const todayISO = fmtISO(new Date());
  const reqItem = {
    id: 'r' + crypto.randomBytes(4).toString('hex'),
    userId: req.user.id,
    type,
    title: REQUEST_TYPES[type],
    comment: (comment || '').trim(),
    createdAt: todayISO,
    status: 'new',
    history: [{ status: 'new', at: todayISO, by: shortName(req.user.profile.fullName) }]
  };
  db.requests.push(reqItem);
  db.notifications.push({
    id: 'n' + crypto.randomBytes(4).toString('hex'),
    ts: new Date().toISOString(),
    userId: req.user.id,
    kind: 'request',
    title: 'Заявка принята',
    text: `«${reqItem.title}» принята в работу деканатом. Статус можно отслеживать в разделе «Заявки».`,
    date: todayISO,
    read: false
  });
  saveDb();
  res.status(201).json({ request: reqItem });
});

function shortName(full) {
  const p = String(full || '').split(' ');
  return p.length >= 2 ? `${p[0]} ${p[1][0]}. ${p[2] ? p[2][0] + '.' : ''}`.replace(' .', '.') : full;
}

// ---------- Уведомления ----------
app.get('/api/notifications', requireAuth, (req, res) => {
  const mine = db.notifications
    .filter(n => n.userId === req.user.id)
    .sort((a, b) => (b.ts || b.date).localeCompare(a.ts || a.date));
  res.json({ notifications: mine });
});

app.post('/api/notifications/read', requireAuth, (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids : null;
  db.notifications.forEach(n => {
    if (n.userId === req.user.id && (!ids || ids.includes(n.id))) n.read = true;
  });
  saveDb();
  res.json({ ok: true });
});

// ---------- Помощник деканата (rule-based чат-бот) ----------
// Отвечает строго по данным текущего пользователя — чужие данные недоступны
// и здесь. Архитектура позволяет заменить движок на LLM (GigaChat/YandexGPT)
// через переменную окружения, не меняя фронтенд.
function lessonText(l) {
  return `${l.subject} (${l.type.toLowerCase()}), ${l.start}–${l.end}, ауд. ${l.room}, ${l.teacher}`;
}

function assistantReply(user, rawMessage) {
  const msg = String(rawMessage || '').toLowerCase();
  const has = (...words) => words.some(w => msg.includes(w));
  const uid = user.id;

  if (user.role === 'staff') {
    const queue = db.requests.filter(r => r.status !== 'ready' && r.status !== 'rejected');
    if (has('заявк', 'очеред', 'сколько')) {
      return {
        reply: queue.length
          ? `В очереди ${queue.length} заявк${queue.length === 1 ? 'а' : 'и'}. Самая свежая — «${queue.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0].title}». Откройте очередь, чтобы продвинуть статусы.`
          : 'Очередь пуста — все заявки обработаны. Можно пить чай.',
        suggestions: ['Обновить очередь']
      };
    }
    return {
      reply: 'Я помощник деканата. Спросите про очередь заявок — например: «Сколько заявок в работе?»',
      suggestions: ['Сколько заявок в работе?']
    };
  }

  const week = buildWeek(uid, 0);
  const today = week.days.find(d => d.isToday);
  const nowTime = mskNow().time;
  const name = user.profile.fullName.split(' ')[1] || 'студент';

  // Приветствие
  if (has('привет', 'здравств', 'добрый')) {
    return {
      reply: `Привет, ${name}! Я помощник деканата — подскажу расписание, статус заявок, баллы, дедлайны и сессию. Что интересует?`,
      suggestions: ['Какая следующая пара?', 'Что с моей заявкой?', 'Когда сессия?', 'Как дела с учёбой?']
    };
  }

  // Следующая пара
  if (has('следующ', 'ближайш') && has('пар', 'занят', 'лекц')) {
    const next = (today?.lessons || []).find(l => l.end > nowTime && l.change?.kind !== 'отмена');
    return {
      reply: next
        ? (next.start <= nowTime
          ? `Сейчас идёт ${lessonText(next)}. Успеваете?`
          : `Ближайшая пара: ${lessonText(next)}.`)
        : 'На сегодня пары закончились — свободен. Полное расписание — в разделе «Расписание».',
      suggestions: ['Расписание на завтра', 'Когда сессия?']
    };
  }

  // Расписание на завтра / сегодня
  if (has('расписан')) {
    const idx = week.days.indexOf(today);
    if (has('завтра')) {
      const tomorrow = week.days[idx + 1];
      if (!tomorrow) return { reply: 'Завтра воскресенье — занятий нет. Отдыхайте!', suggestions: ['Расписание на сегодня'] };
      return {
        reply: tomorrow.lessons.length
          ? `Завтра (${tomorrow.weekday.toLowerCase()}): ${tomorrow.lessons.map(lessonText).join('; ')}.`
          : 'Завтра занятий нет — можно выспаться.',
        suggestions: ['Расписание на сегодня', 'Какая следующая пара?']
      };
    }
    return {
      reply: today?.lessons.length
        ? `Сегодня: ${today.lessons.map(lessonText).join('; ')}.`
        : 'Сегодня занятий нет.',
      suggestions: ['Расписание на завтра', 'Какая следующая пара?']
    };
  }

  // Сессия
  if (has('сесси', 'экзамен')) {
    const sess = db.sessions[uid];
    if (!sess) return { reply: 'Даты сессии пока не объявлены.', suggestions: ['Как дела с учёбой?'] };
    const days = daysBetween(mskNow().date, sess.examsStart);
    return {
      reply: days > 0
        ? `Сессия с ${sess.examsStart.split('-').reverse().join('.')} по ${sess.examsEnd.split('-').reverse().join('.')} — осталось ${days} дн. Идущие баллы и прогноз по каждой дисциплине — в разделе «Успеваемость».`
        : 'Сессия уже идёт! Держитесь. Расписание экзаменов уточняйте в деканате.',
      suggestions: ['Как дела с учёбой?', 'Что по баллам?']
    };
  }

  // Успеваемость / баллы
  if (has('балл', 'успева', 'оценк', 'средн', 'учёб', 'учеб')) {
    const g = db.grades[uid];
    const cur = g?.semesters.find(s => s.current);
    if (!cur) return { reply: 'Данных об успеваемости пока нет.', suggestions: [] };
    const weakest = [...cur.subjects].sort((a, b) => a.points - b.points)[0];
    const best = [...cur.subjects].sort((a, b) => b.points - a.points)[0];
    return {
      reply: `Средний балл — ${g.gpa}. Лучше всего идёт «${best.name}» (${best.points} из 120), а вот «${weakest.name}» стоит подтянуть: сейчас ${weakest.points}, до «4» не хватает ${Math.max(0, 60 - weakest.points)}. Раскройте дисциплину в «Успеваемости» — там разбивка, за что начислены баллы.`,
      suggestions: ['Когда сессия?', 'Что с моей заявкой?']
    };
  }

  // Заявки: статус и как заказать
  if (has('заявк', 'справк', 'заявлен', 'статус')) {
    if (has('заказ', 'подать', 'оформ', 'получить', 'как')) {
      return {
        reply: 'Всё просто: откройте раздел «Заявки», выберите тип (справка об обучении, справка в военкомат, пересдача, академ) и нажмите «Подать заявку». Обычно готовят 1–2 рабочих дня — статус виден там же в таймлайне, а о готовности я напомню уведомлением.',
        suggestions: ['Что с моей заявкой?']
      };
    }
    const mine = db.requests
      .filter(r => r.userId === uid)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    if (!mine.length) {
      return { reply: 'У вас пока нет заявок. Заказать справку можно в разделе «Заявки» — займёт секунд 20.', suggestions: ['Как заказать справку?'] };
    }
    const list = mine.slice(0, 3).map(r => `«${r.title}» — ${STATUS_LABELS[r.status] || r.status}${r.status === 'ready' ? ', можно забрать: ' + (r.pickup || 'деканат') : ''}`).join('; ');
    return { reply: `Ваши заявки: ${list}. Подробный таймлайн — в разделе «Заявки».`, suggestions: ['Как заказать справку?'] };
  }

  // Уведомления / дедлайны
  if (has('уведомлен', 'новост', 'нового', 'дедлайн', 'срок')) {
    const unread = db.notifications.filter(n => n.userId === uid && !n.read)
      .sort((a, b) => (b.ts || b.date).localeCompare(a.ts || a.date));
    return {
      reply: unread.length
        ? `Непрочитанных: ${unread.length}. Самое свежее — «${unread[0].title}»: ${unread[0].text}`
        : 'Всё прочитано, новых уведомлений нет. Я напомню, как только что-то появится.',
      suggestions: ['Какая следующая пара?', 'Когда сессия?']
    };
  }

  // Fallback
  return {
    reply: 'Пока умею отвечать про расписание, ближайшую пару, сессию, баллы, заявки и уведомления. Попробуйте, например:',
    suggestions: ['Какая следующая пара?', 'Что с моей заявкой?', 'Когда сессия?', 'Как дела с учёбой?', 'Как заказать справку?']
  };
}

app.post('/api/assistant', requireAuth, (req, res) => {
  const message = String(req.body?.message || '').slice(0, 300).trim();
  if (!message) return res.status(400).json({ error: 'Пустое сообщение' });
  res.json(assistantReply(req.user, message));
});

// ---------- Кабинет сотрудника ----------
app.get('/api/staff/requests', requireAuth, requireStaff, (req, res) => {
  const all = db.requests
    .map(r => {
      const u = db.users.find(x => x.id === r.userId);
      return { ...r, student: u ? { name: u.profile.fullName, group: u.profile.group, recordBook: u.profile.recordBook } : null };
    })
    .sort((a, b) => (a.status === 'ready' ? 1 : 0) - (b.status === 'ready' ? 1 : 0) || b.createdAt.localeCompare(a.createdAt));
  res.json({ requests: all, statusFlow: STATUS_FLOW });
});

app.patch('/api/staff/requests/:id', requireAuth, requireStaff, (req, res) => {
  const r = db.requests.find(x => x.id === req.params.id);
  if (!r) return res.status(404).json({ error: 'Заявка не найдена' });
  const next = req.body?.status;
  const idx = STATUS_FLOW.indexOf(r.status);
  if (next !== STATUS_FLOW[idx + 1]) {
    return res.status(400).json({ error: 'Статус можно только продвинуть вперёд по цепочке' });
  }
  r.status = next;
  const todayISO = fmtISO(new Date());
  r.history.push({ status: next, at: todayISO, by: shortName(req.user.profile.fullName) });
  if (next === 'ready') r.pickup = 'Деканат, каб. 214';
  db.notifications.push({
    id: 'n' + crypto.randomBytes(4).toString('hex'),
    ts: new Date().toISOString(),
    userId: r.userId,
    kind: 'request',
    title: next === 'ready' ? 'Документ готов' : 'Заявка в работе',
    text: next === 'ready'
      ? `«${r.title}» готова. Заберите в деканате, каб. 214.`
      : `«${r.title}» взята в работу специалистом деканата.`,
    date: todayISO,
    read: false
  });
  saveDb();
  res.json({ request: r });
});

// ---------- Статика ----------
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1h', index: 'index.html' }));

app.listen(PORT, () => {
  console.log(`Цифровой деканат будущего: http://localhost:${PORT}`);
});
