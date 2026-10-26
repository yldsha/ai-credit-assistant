const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

// Словарь для перевода технических статусов бэкенда в красивые русские
export const translateStatus = (status: string) => {
  const map: Record<string, string> = {
    draft: 'Черновик',
    submitted: 'На рассмотрении',
    checking: 'Проверка данных',
    scoring: 'Оценка рисков',
    approved: 'Одобрено',
    rejected: 'Отказ',
    manual_review: 'На рассмотрении', // или "Ручная проверка"
    need_info: 'Нужна информация',
    counter_offer: 'Предложена альтернатива',
    issued: 'Кредит выдан',
  };
  return map[status] || status;
};

// Адаптер: переводит данные с бэкенда (Python) в формат, который ждет наш React
const normalizeApplication = (app: any) => {
  if (!app) return null;

  return {
    ...app,
    // Переводим ключи
    company: app.company_name || app.company || 'Без названия',
    term: app.term_months || app.term || 0,
    riskScore: app.pd !== undefined ? app.pd : app.riskScore,
    alternativeProduct: app.offer || app.alternativeProduct,
    // Расшифровываем статус для интерфейса
    status: translateStatus(app.status),
    // Форматируем таймлайн (бэкенд отдает историю в поле status_history)
    timeline: app.status_history?.map((h: any) => ({
      step: translateStatus(h.new_status),
      date: new Date(h.changed_at).toLocaleString('ru-RU'),
      done: true,
      comment: h.comment
    })) || app.timeline || [],
  };
};

// === НОВАЯ ФУНКЦИЯ ДЛЯ POST /recommend ===
// Вызывает готовый подбор на бэкенде с метками и причинами
export async function fetchRecommendations(params: any) {
  const payload = {
    amount: params.amount,
    term_months: params.termYears * 12,
    purpose: params.purpose || 'working_capital',
    legal_form: params.type === 'ООО' ? 'OOO' : 'IP',
    business_age_months: params.businessAgeMonths || 24,
    has_collateral: params.collateral === 'С залогом',
    collateral_type: params.collateral === 'С залогом' ? 'real_estate' : 'none'
  };

  const res = await fetch(`${API_URL}/recommend`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!res.ok) throw new Error('Ошибка при подборе продуктов');
  return res.json();
}

// === ЭНДПОИНТЫ ДЛЯ КЛИЕНТА ===

export async function getApplications(inn: string) {
  const localIds = JSON.parse(localStorage.getItem(`my_apps_${inn}`) || '[]');
  if (localIds.length === 0) return [];

  const apps = [];
  for (const id of localIds) {
    try {
      const res = await fetch(`${API_URL}/applications/${id}`);
      if (res.ok) {
        const data = await res.json();
        apps.push(normalizeApplication(data));
      }
    } catch (e) {
      console.error('Ошибка загрузки заявки', id, e);
    }
  }
  return apps;
}

// Пустое поле формы -> null, чтобы бэкенд не получал 0 вместо «не указано»
const toNum = (v: any): number | null =>
  v === '' || v === null || v === undefined || isNaN(Number(v)) ? null : Number(v);

export async function createDraft(data: any) {
  const payload = {
    inn: data.inn,
    product_id: data.productId || null,
    amount: data.amount,
    term_months: data.term,
    purpose: data.purpose || "working_capital",
    legal_form: data.type === 'ООО' ? 'OOO' : 'IP',
    has_collateral: data.collateral === 'С залогом',
    collateral_type: data.collateral === 'С залогом' ? 'real_estate' : 'none',
    business_age_months: data.businessAgeMonths || 24,
    annual_revenue: toNum(data.revenue),
    // ИСПРАВЛЕНО: Берем реальные значения из формы, если они есть
    monthly_turnover: toNum(data.monthlyTurnover) ?? (toNum(data.revenue) ?? 0) / 12,
    monthly_expenses: toNum(data.monthlyExpenses) ?? 0,
    existing_debt: toNum(data.liabilities) ?? 0,
    monthly_debt_payments: toNum(data.monthlyDebtPayments) ?? (toNum(data.liabilities) ?? 0) / 24,
    overdue_days: 0,
    collateral_value: 0,
    industry: "trade",
    bki_consent: true
  };

  const res = await fetch(`${API_URL}/applications/draft`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const result = await res.json();

  const localIds = JSON.parse(localStorage.getItem(`my_apps_${data.inn}`) || '[]');
  localStorage.setItem(`my_apps_${data.inn}`, JSON.stringify([...localIds, result.application.id]));

  return normalizeApplication(result.application);
}

export async function submitApplication(id: number) {
  const res = await fetch(`${API_URL}/applications/${id}/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  });
  const data = await res.json();
  return normalizeApplication(data);
}

export async function getApplicationById(id: number) {
  const res = await fetch(`${API_URL}/applications/${id}`);
  const data = await res.json();
  return normalizeApplication(data);
}

// === ЭНДПОИНТЫ ДЛЯ СОТРУДНИКА ===

export async function getEmployeeApplications() {
  const res = await fetch(`${API_URL}/employee/applications`);
  const data = await res.json();
  return data.map(normalizeApplication);
}

export async function makeEmployeeDecision(id: number, outcome: string, comment: string, extra?: any) {
  const payload: any = {
    outcome,
    comment,
    employee_id: 2,
  };

  if (extra?.productId) payload.product_id = extra.productId;
  if (extra?.amount) payload.amount = extra.amount;
  if (extra?.term) payload.term_months = extra.term;
  if (extra?.missingFields) payload.missing_fields = extra.missingFields;

  const res = await fetch(`${API_URL}/employee/applications/${id}/decision`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  return normalizeApplication(data);
}

export async function uploadDocument(inn: string, docId: string, file: File) {
  await new Promise(r => setTimeout(r, 500));
  const docs = JSON.parse(localStorage.getItem(`docs_${inn}`) || '{}');
  docs[docId] = { name: file.name, size: file.size };
  localStorage.setItem(`docs_${inn}`, JSON.stringify(docs));
  return docs[docId];
}

export async function getDocuments(inn: string) {
  return JSON.parse(localStorage.getItem(`docs_${inn}`) || '{}');
}

// === АВТОЗАПОЛНЕНИЕ ПО ИНН ===
export async function autofillCompanyByInn(inn: string) {
  const res = await fetch(`${API_URL}/applications/autofill/${inn}`);

  if (res.status === 404) {
    throw new Error('Компания с таким ИНН не найдена');
  }
  if (!res.ok) {
    throw new Error('Ошибка при получении данных из ЕГРЮЛ');
  }

  return res.json();
}

// === ПОДПИСАНИЕ ДОГОВОРА ===
export async function signContract(id: number, otpCode: string) {
  const res = await fetch(`${API_URL}/applications/${id}/sign`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ otp_code: otpCode })
  });

  if (!res.ok) {
    throw new Error('Неверный код подтверждения или ошибка сервера');
  }

  const data = await res.json();
  return normalizeApplication(data);
}