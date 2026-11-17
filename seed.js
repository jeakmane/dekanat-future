/**
 * Генератор начальных данных прототипа.
 * ВСЕ данные вымышленные: люди, вуз, оценки, зачётки не существуют.
 * Запуск: npm run seed
 */
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

const fmt = (d) => d.toISOString().slice(0, 10);
const today = new Date();
const addDays = (n) => { const d = new Date(today); d.setDate(d.getDate() + n); return d; };

const users = [
  {
    id: 'u1',
    login: 'ivan.petrov',
    passwordHash: bcrypt.hashSync('student123', 10),
    role: 'student',
    profile: {
      fullName: 'Петров Иван Алексеевич',
      faculty: 'Факультет информационных технологий',
      program: 'Программная инженерия',
      course: 3,
      group: 'ПИ-301',
      recordBook: 'ЗЧ-2023-0417',
      email: 'i.petrov@stud.stu-future.example',
      phone: '+7 (900) 111-22-33',
      avatar: 'ИП'
    }
  },
  {
    id: 'u2',
    login: 'maria.sokolova',
    passwordHash: bcrypt.hashSync('student123', 10),
    role: 'student',
    profile: {
      fullName: 'Соколова Мария Дмитриевна',
      faculty: 'Экономический факультет',
      program: 'Экономика',
      course: 2,
      group: 'ЭК-205',
      recordBook: 'ЗЧ-2024-0892',
      email: 'm.sokolova@stud.stu-future.example',
      phone: '+7 (900) 444-55-66',
      avatar: 'МС'
    }
  },
  {
    id: 's1',
    login: 'dekanat',
    passwordHash: bcrypt.hashSync('dekanat123', 10),
    role: 'staff',
    profile: {
      fullName: 'Воронова Анна Сергеевна',
      position: 'Специалист деканата ФИТ',
      avatar: 'АВ'
    }
  }
];

// Расписание — шаблон недели (1=Пн ... 6=Сб). Время, пары, преподаватели вымышленные.
const scheduleTemplates = {
  u1: {
    1: [
      { start: '09:00', end: '10:30', subject: 'Базы данных', type: 'Лекция', teacher: 'проф. Крылов С. Н.', room: 'ГК-204' },
      { start: '10:45', end: '12:15', subject: 'Базы данных', type: 'Практика', teacher: 'доц. Ольгина В. Р.', room: 'ГК-315' },
      { start: '13:00', end: '14:30', subject: 'Иностранный язык', type: 'Практика', teacher: 'ст. пр. Белова К. А.', room: 'К2-118' }
    ],
    2: [
      { start: '09:00', end: '10:30', subject: 'Операционные системы', type: 'Лекция', teacher: 'доц. Звягин П. Л.', room: 'ГК-101' },
      { start: '10:45', end: '12:15', subject: 'Операционные системы', type: 'Лабораторная', teacher: 'доц. Звягин П. Л.', room: 'ГК-402' },
      { start: '13:00', end: '14:30', subject: 'Теория вероятностей', type: 'Лекция', teacher: 'проф. Мирославская Е. Т.', room: 'К1-220' }
    ],
    3: [
      { start: '10:45', end: '12:15', subject: 'Веб-разработка', type: 'Лабораторная', teacher: 'доц. Ольгина В. Р.', room: 'ГК-310' },
      { start: '13:00', end: '14:30', subject: 'Веб-разработка', type: 'Лекция', teacher: 'доц. Ольгина В. Р.', room: 'ГК-204' }
    ],
    4: [
      { start: '09:00', end: '10:30', subject: 'Теория вероятностей', type: 'Практика', teacher: 'асс. Громов И. В.', room: 'К1-214' },
      { start: '10:45', end: '12:15', subject: 'Физическая культура', type: 'Практика', teacher: 'тренер Соколов Д. М.', room: 'Спортзал' },
      { start: '13:00', end: '14:30', subject: 'Проектный практикум', type: 'Практика', teacher: 'доц. Звягин П. Л.', room: 'ГК-318' }
    ],
    5: [
      { start: '09:00', end: '10:30', subject: 'Базы данных', type: 'Лабораторная', teacher: 'доц. Ольгина В. Р.', room: 'ГК-315' },
      { start: '10:45', end: '12:15', subject: 'История России', type: 'Лекция', teacher: 'доц. Переверзева Л. Г.', room: 'К2-201' }
    ],
    6: []
  },
  u2: {
    1: [
      { start: '09:00', end: '10:30', subject: 'Микроэкономика', type: 'Лекция', teacher: 'проф. Северьянова Р. П.', room: 'К3-305' },
      { start: '10:45', end: '12:15', subject: 'Микроэкономика', type: 'Семинар', teacher: 'доц. Лебедева Т. Ю.', room: 'К3-312' }
    ],
    2: [
      { start: '10:45', end: '12:15', subject: 'Бухгалтерский учёт', type: 'Лекция', teacher: 'доц. Вишневская О. А.', room: 'К3-210' },
      { start: '13:00', end: '14:30', subject: 'Статистика', type: 'Практика', teacher: 'ст. пр. Ковалёв М. С.', room: 'К3-118' }
    ],
    3: [
      { start: '09:00', end: '10:30', subject: 'Иностранный язык', type: 'Практика', teacher: 'ст. пр. Зимина Н. В.', room: 'К2-120' },
      { start: '10:45', end: '12:15', subject: 'Макроэкономика', type: 'Лекция', teacher: 'проф. Северьянова Р. П.', room: 'К3-305' },
      { start: '13:00', end: '14:30', subject: 'Физическая культура', type: 'Практика', teacher: 'тренер Соколов Д. М.', room: 'Спортзал' }
    ],
    4: [
      { start: '09:00', end: '10:30', subject: 'Статистика', type: 'Лекция', teacher: 'доц. Лебедева Т. Ю.', room: 'К3-214' },
      { start: '10:45', end: '12:15', subject: 'Бухгалтерский учёт', type: 'Практика', teacher: 'доц. Вишневская О. А.', room: 'К3-216' }
    ],
    5: [
      { start: '13:00', end: '14:30', subject: 'Эконометрика', type: 'Семинар', teacher: 'ст. пр. Ковалёв М. С.', room: 'К3-119' }
    ],
    6: []
  }
};

// Изменения в расписании на текущую неделю (даты считаются от дня сидирования).
const scheduleChanges = [
  { id: 'c1', userId: 'u1', date: fmt(addDays(0)), lessonStart: '13:00', kind: 'перенос', note: 'Пара «Иностранный язык» перенесена на 15:00, ауд. К2-120' },
  { id: 'c2', userId: 'u1', date: fmt(addDays(2)), lessonStart: '09:00', kind: 'замена', note: 'Вместо лекции «Базы данных» — консультация перед контрольной, ауд. ГК-204' },
  { id: 'c3', userId: 'u2', date: fmt(addDays(1)), lessonStart: '10:45', kind: 'отмена', note: 'Лекция «Бухгалтерский учёт» отменена, перенос будет объявлен позже' }
];

// Успеваемость по семестрам.
const grades = {
  u1: {
    gpa: 4.42,
    semesters: [
      {
        name: 'Семестр 5 (текущий)',
        current: true,
        subjects: [
          {
            name: 'Базы данных', kind: 'экзамен', points: 78, max: 120, mark: null, status: 'идёт',
            parts: [
              { label: 'Текущий контроль', points: 30, max: 40 },
              { label: 'Семестровый контроль', points: 32, max: 40 },
              { label: 'Посещения', points: 16, max: 20 },
              { label: 'Достижения', points: 0, max: 10 },
              { label: 'Дополнительные', points: 0, max: 10 }
            ]
          },
          {
            name: 'Операционные системы', kind: 'экзамен', points: 71, max: 120, mark: null, status: 'идёт',
            parts: [
              { label: 'Текущий контроль', points: 28, max: 40 },
              { label: 'Семестровый контроль', points: 30, max: 40 },
              { label: 'Посещения', points: 13, max: 20 },
              { label: 'Достижения', points: 0, max: 10 },
              { label: 'Дополнительные', points: 0, max: 10 }
            ]
          },
          {
            name: 'Теория вероятностей', kind: 'экзамен', points: 64, max: 120, mark: null, status: 'идёт',
            parts: [
              { label: 'Текущий контроль', points: 24, max: 40 },
              { label: 'Семестровый контроль', points: 26, max: 40 },
              { label: 'Посещения', points: 14, max: 20 },
              { label: 'Достижения', points: 0, max: 10 },
              { label: 'Дополнительные', points: 0, max: 10 }
            ]
          },
          {
            name: 'Веб-разработка', kind: 'зачёт', points: 88, max: 120, mark: null, status: 'идёт',
            parts: [
              { label: 'Текущий контроль', points: 32, max: 40 },
              { label: 'Семестровый контроль', points: 36, max: 40 },
              { label: 'Посещения', points: 18, max: 20 },
              { label: 'Достижения', points: 2, max: 10 },
              { label: 'Дополнительные', points: 0, max: 10 }
            ]
          },
          {
            name: 'Иностранный язык', kind: 'зачёт', points: 90, max: 120, mark: null, status: 'идёт',
            parts: [
              { label: 'Текущий контроль', points: 34, max: 40 },
              { label: 'Семестровый контроль', points: 36, max: 40 },
              { label: 'Посещения', points: 18, max: 20 },
              { label: 'Достижения', points: 2, max: 10 },
              { label: 'Дополнительные', points: 0, max: 10 }
            ]
          },
          {
            name: 'История России', kind: 'зачёт', points: 83, max: 120, mark: null, status: 'идёт',
            parts: [
              { label: 'Текущий контроль', points: 30, max: 40 },
              { label: 'Семестровый контроль', points: 34, max: 40 },
              { label: 'Посещения', points: 17, max: 20 },
              { label: 'Достижения', points: 2, max: 10 },
              { label: 'Дополнительные', points: 0, max: 10 }
            ]
          }
        ]
      },
      {
        name: 'Семестр 4',
        current: false,
        subjects: [
          { name: 'Алгоритмы и структуры данных', kind: 'экзамен', points: 91, max: 100, mark: 5, status: 'закрыто' },
          { name: 'Архитектура ЭВМ', kind: 'экзамен', points: 74, max: 100, mark: 4, status: 'закрыто' },
          { name: 'Математический анализ', kind: 'экзамен', points: 68, max: 100, mark: 4, status: 'закрыто' },
          { name: 'Практикум по программированию', kind: 'зачёт', points: 95, max: 100, mark: 'зачёт', status: 'закрыто' },
          { name: 'Экономика', kind: 'зачёт', points: 81, max: 100, mark: 'зачёт', status: 'закрыто' }
        ]
      },
      {
        name: 'Семестр 3',
        current: false,
        subjects: [
          { name: 'Объектно-ориентированное программирование', kind: 'экзамен', points: 88, max: 100, mark: 5, status: 'закрыто' },
          { name: 'Дискретная математика', kind: 'экзамен', points: 79, max: 100, mark: 4, status: 'закрыто' },
          { name: 'Физика', kind: 'экзамен', points: 62, max: 100, mark: 4, status: 'закрыто' },
          { name: 'Иностранный язык', kind: 'зачёт', points: 86, max: 100, mark: 'зачёт', status: 'закрыто' }
        ]
      }
    ]
  },
  u2: {
    gpa: 4.71,
    semesters: [
      {
        name: 'Семестр 3 (текущий)',
        current: true,
        subjects: [
          {
            name: 'Микроэкономика', kind: 'экзамен', points: 84, max: 120, mark: null, status: 'идёт',
            parts: [
              { label: 'Текущий контроль', points: 32, max: 40 },
              { label: 'Семестровый контроль', points: 34, max: 40 },
              { label: 'Посещения', points: 16, max: 20 },
              { label: 'Достижения', points: 2, max: 10 },
              { label: 'Дополнительные', points: 0, max: 10 }
            ]
          },
          {
            name: 'Макроэкономика', kind: 'экзамен', points: 79, max: 120, mark: null, status: 'идёт',
            parts: [
              { label: 'Текущий контроль', points: 30, max: 40 },
              { label: 'Семестровый контроль', points: 32, max: 40 },
              { label: 'Посещения', points: 15, max: 20 },
              { label: 'Достижения', points: 2, max: 10 },
              { label: 'Дополнительные', points: 0, max: 10 }
            ]
          },
          {
            name: 'Бухгалтерский учёт', kind: 'экзамен', points: 91, max: 120, mark: null, status: 'идёт',
            parts: [
              { label: 'Текущий контроль', points: 34, max: 40 },
              { label: 'Семестровый контроль', points: 37, max: 40 },
              { label: 'Посещения', points: 18, max: 20 },
              { label: 'Достижения', points: 2, max: 10 },
              { label: 'Дополнительные', points: 0, max: 10 }
            ]
          },
          {
            name: 'Статистика', kind: 'зачёт', points: 76, max: 120, mark: null, status: 'идёт',
            parts: [
              { label: 'Текущий контроль', points: 29, max: 40 },
              { label: 'Семестровый контроль', points: 30, max: 40 },
              { label: 'Посещения', points: 15, max: 20 },
              { label: 'Достижения', points: 2, max: 10 },
              { label: 'Дополнительные', points: 0, max: 10 }
            ]
          },
          {
            name: 'Эконометрика', kind: 'зачёт', points: 69, max: 120, mark: null, status: 'идёт',
            parts: [
              { label: 'Текущий контроль', points: 26, max: 40 },
              { label: 'Семестровый контроль', points: 27, max: 40 },
              { label: 'Посещения', points: 14, max: 20 },
              { label: 'Достижения', points: 2, max: 10 },
              { label: 'Дополнительные', points: 0, max: 10 }
            ]
          }
        ]
      },
      {
        name: 'Семестр 2',
        current: false,
        subjects: [
          { name: 'Введение в экономическую теорию', kind: 'экзамен', points: 93, max: 100, mark: 5, status: 'закрыто' },
          { name: 'Математика для экономистов', kind: 'экзамен', points: 85, max: 100, mark: 5, status: 'закрыто' },
          { name: 'История экономических учений', kind: 'экзамен', points: 77, max: 100, mark: 4, status: 'закрыто' },
          { name: 'Информационные технологии', kind: 'зачёт', points: 90, max: 100, mark: 'зачёт', status: 'закрыто' }
        ]
      },
      {
        name: 'Семестр 1',
        current: false,
        subjects: [
          { name: 'Введение в специальность', kind: 'зачёт', points: 88, max: 100, mark: 'зачёт', status: 'закрыто' },
          { name: 'Математический анализ', kind: 'экзамен', points: 82, max: 100, mark: 5, status: 'закрыто' },
          { name: 'Иностранный язык', kind: 'зачёт', points: 87, max: 100, mark: 'зачёт', status: 'закрыто' },
          { name: 'Правоведение', kind: 'экзамен', points: 73, max: 100, mark: 4, status: 'закрыто' }
        ]
      }
    ]
  }
};

// Заявки (стартовые, чтобы было что посмотреть).
const requests = [
  {
    id: 'r1',
    userId: 'u1',
    type: 'spravka-study',
    title: 'Справка об обучении',
    comment: 'Для банка, 2 экземпляра',
    createdAt: fmt(addDays(-3)),
    status: 'ready',
    history: [
      { status: 'new', at: fmt(addDays(-3)), by: 'Петров И. А.' },
      { status: 'in_progress', at: fmt(addDays(-2)), by: 'Воронова А. С.' },
      { status: 'ready', at: fmt(addDays(-1)), by: 'Воронова А. С.' }
    ],
    pickup: 'Деканат ФИТ, каб. 214'
  },
  {
    id: 'r2',
    userId: 'u1',
    type: 'statement-retake',
    title: 'Заявление на пересдачу',
    comment: 'Математический анализ, вторая попытка',
    createdAt: fmt(addDays(0)),
    status: 'new',
    history: [{ status: 'new', at: fmt(addDays(0)), by: 'Петров И. А.' }]
  },
  {
    id: 'r3',
    userId: 'u2',
    type: 'spravka-military',
    title: 'Справка в военкомат',
    comment: '',
    createdAt: fmt(addDays(-1)),
    status: 'in_progress',
    history: [
      { status: 'new', at: fmt(addDays(-1)), by: 'Соколова М. Д.' },
      { status: 'in_progress', at: fmt(addDays(0)), by: 'Орлова Т. Н.' }
    ]
  }
];

// Уведомления.
const notifications = [
  { id: 'n1', userId: 'u1', kind: 'deadline', title: 'Дедлайн по курсовой', text: 'Загрузить курсовую по «Базам данных» нужно до ' + fmt(addDays(5)) + '. Осталось 5 дней.', date: fmt(addDays(0)), read: false },
  { id: 'n2', userId: 'u1', kind: 'schedule', title: 'Перенос пары', text: 'Завтра лекция «Базы данных» заменена консультацией, ауд. ГК-204.', date: fmt(addDays(0)), read: false },
  { id: 'n3', userId: 'u1', kind: 'news', title: 'День открытых дверей деканата', text: 'В четверг с 12:00 до 15:00 деканат работает без записи — можно задать любые вопросы.', date: fmt(addDays(-2)), read: true },
  { id: 'n4', userId: 'u1', kind: 'request', title: 'Справка готова', text: 'Справка об обучении готова. Заберите в деканате ФИТ, каб. 214.', date: fmt(addDays(-1)), read: false },
  { id: 'n5', userId: 'u2', kind: 'deadline', title: 'Оплата общежития', text: 'Напоминаем: внести оплату за общежитие нужно до ' + fmt(addDays(7)) + '.', date: fmt(addDays(0)), read: false },
  { id: 'n6', userId: 'u2', kind: 'schedule', title: 'Отмена лекции', text: 'Лекция «Бухгалтерский учёт» завтра отменена. О переносе сообщим дополнительно.', date: fmt(addDays(0)), read: false },
  { id: 'n7', userId: 'u2', kind: 'news', title: 'Стипендиальный конкурс', text: 'Открыт приём заявок на повышенную стипендию. Документы принимаются до конца месяца.', date: fmt(addDays(-4)), read: true }
];

// Даты сессии (для счётчика на дашборде).
const sessions = {
  u1: { examsStart: fmt(addDays(38)), examsEnd: fmt(addDays(59)) },
  u2: { examsStart: fmt(addDays(35)), examsEnd: fmt(addDays(56)) }
};

const db = {
  meta: {
    generatedAt: new Date().toISOString(),
    disclaimer: 'Все персоны, вуз, оценки и документы вымышлены. Концепт для конкурса.'
  },
  users,
  scheduleTemplates,
  scheduleChanges,
  grades,
  requests,
  notifications,
  sessions
};

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
console.log('OK: данные созданы в', DB_FILE);
console.log('Аккаунты: ivan.petrov / student123 (студент), maria.sokolova / student123 (студент), dekanat / dekanat123 (сотрудник)');
