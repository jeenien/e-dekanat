// Каталог услуг деканата. Описание полей формы живет на сервере:
// фронтенд строит форму по этой схеме, а сервер по ней же проверяет ввод.

const PURPOSES = ['По месту требования', 'По месту работы родителей', 'Социальная защита / пенсионный фонд', 'Для оформления визы', 'Для налогового вычета', 'Другое'];

const TYPES = {
  study_cert: {
    title: 'Справка об обучении', group: 'Справки', icon: 'docs', popular: true,
    description: 'Подтверждает, что вы учитесь в университете. Электронная версия с QR-кодом готова сразу.',
    sla_days: 2, instant_if: { format: 'electronic' }, document: true,
    fields: [
      { name: 'purpose', label: 'Куда нужна справка', type: 'select', options: PURPOSES, required: true },
      { name: 'format', label: 'Формат', type: 'segmented', options: [
        { value: 'electronic', label: 'Электронная с QR — сразу' },
        { value: 'paper', label: 'Бумажная с печатью — 2 дня' }], required: true, default: 'electronic' },
      { name: 'copies', label: 'Количество экземпляров', type: 'number', min: 1, max: 5, default: 1, showIf: { format: 'paper' } },
      { name: 'comment', label: 'Комментарий для деканата', type: 'textarea', maxLength: 500, placeholder: 'Например: нужна к пятнице' },
    ],
  },
  transcript: {
    title: 'Выписка из зачетной книжки', group: 'Справки', icon: 'grades', popular: true,
    description: 'Все оценки за выбранные семестры. Русская версия формируется сразу, английская — за 5 дней.',
    sla_days: 5, instant_if: { lang: 'ru' }, document: true,
    fields: [
      { name: 'lang', label: 'Язык', type: 'segmented', options: [
        { value: 'ru', label: 'Русский — сразу' }, { value: 'en', label: 'Английский — 5 дней' }], required: true, default: 'ru' },
      { name: 'comment', label: 'Комментарий', type: 'textarea', maxLength: 500 },
    ],
  },
  stipend_cert: {
    title: 'Справка о размере стипендии', group: 'Справки', icon: 'wallet',
    description: 'Для соцзащиты, субсидий и налогового вычета. Готовит бухгалтерия.',
    sla_days: 3,
    fields: [
      { name: 'period', label: 'За период', type: 'select', options: ['3 месяца', '6 месяцев', '12 месяцев'], required: true },
      { name: 'purpose', label: 'Куда нужна справка', type: 'select', options: PURPOSES, required: true },
    ],
  },
  rector_retake: {
    statement: true,
    title: 'Ректорская пересдача', group: 'Заявления', icon: 'refresh',
    description: 'Если обычные пересдачи, которые назначают деканат и кафедра, уже использованы. Решение принимает проректор, срок рассмотрения — до 5 рабочих дней.',
    sla_days: 5,
    fields: [
      { name: 'discipline', label: 'Дисциплина', type: 'discipline', required: true },
      { name: 'reason', label: 'Почему нужна ректорская пересдача', type: 'textarea', maxLength: 1000, required: true, placeholder: 'Например: болел во время обеих пересдач, справка есть' },
    ],
  },
  financial_aid: {
    statement: true,
    title: 'Материальная помощь', group: 'Заявления', icon: 'wallet',
    description: 'Рассматривает стипендиальная комиссия раз в две недели.',
    sla_days: 14,
    fields: [
      { name: 'reason', label: 'Основание', type: 'select', required: true, options: ['Трудное материальное положение', 'Лечение', 'Рождение ребенка', 'Утрата имущества', 'Другое'] },
      { name: 'details', label: 'Опишите ситуацию', type: 'textarea', maxLength: 1500, required: true },
    ],
  },
  academic_leave: {
    statement: true,
    title: 'Академический отпуск', group: 'Заявления', icon: 'coffee',
    description: 'Перерыв в учебе до двух лет с сохранением места. Нужны подтверждающие документы.',
    sla_days: 10,
    fields: [
      { name: 'reason', label: 'Основание', type: 'select', required: true, options: ['Медицинские показания', 'Семейные обстоятельства', 'Призыв на военную службу', 'Другое'] },
      { name: 'from', label: 'С какой даты', type: 'date', required: true },
      { name: 'details', label: 'Комментарий', type: 'textarea', maxLength: 1000 },
    ],
  },
  question: {
    title: 'Вопрос в деканат', group: 'Связь с деканатом', icon: 'message', popular: true,
    description: 'Напишите — ответ придет сюда же, в переписку по обращению, в течение рабочего дня.',
    sla_days: 1,
    fields: [
      { name: 'topic', label: 'Тема', type: 'text', maxLength: 120, required: true },
      { name: 'text', label: 'Вопрос', type: 'textarea', maxLength: 2000, required: true },
    ],
  },
};

const STATUS = {
  submitted: 'Принята', in_progress: 'В работе', need_info: 'Нужно уточнение',
  ready: 'Готово', done: 'Завершена', rejected: 'Отклонена',
};

module.exports = { TYPES, STATUS };
