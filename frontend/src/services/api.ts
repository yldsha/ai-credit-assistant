const USE_MOCK = true;
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

export async function getApplications(inn: string) {
  if (USE_MOCK) {
    const stored = JSON.parse(localStorage.getItem(`apps_${inn}`) || '[]');
    return [...stored];
  }
  return fetch(`${API_URL}/applications?inn=${inn}`).then(r => r.json());
}

export async function createApplication(data: any) {
  if (USE_MOCK) {
    const stored = JSON.parse(localStorage.getItem(`apps_${data.inn}`) || '[]');
    const newApp = {
      ...data,
      id: `2024-0${Math.floor(Math.random() * 1000)}`,
      date: new Date().toLocaleDateString('ru-RU'),
      timeline: [
        { step: 'Заявка получена', date: new Date().toLocaleString('ru-RU'), done: true },
        { step: 'Проверка данных', date: 'В процессе', done: false },
        { step: 'Оценка рисков', date: '—', done: false },
        { step: 'Решение', date: '—', done: false },
      ],
    };
    localStorage.setItem(`apps_${data.inn}`, JSON.stringify([newApp, ...stored]));
    return newApp;
  }
  return fetch(`${API_URL}/applications`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(r => r.json());
}

export async function updateApplication(inn: string, id: string, patch: any) {
  if (USE_MOCK) {
    const stored = JSON.parse(localStorage.getItem(`apps_${inn}`) || '[]');
    const updated = stored.map((a: any) => a.id === id ? { ...a, ...patch } : a);
    localStorage.setItem(`apps_${inn}`, JSON.stringify(updated));
    return updated;
  }
  return fetch(`${API_URL}/applications/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) }).then(r => r.json());
}

export async function uploadDocument(inn: string, docId: string, file: File) {
  if (USE_MOCK) {
    const docs = JSON.parse(localStorage.getItem(`docs_${inn}`) || '{}');
    docs[docId] = { name: file.name, size: file.size, uploadedAt: new Date().toISOString() };
    localStorage.setItem(`docs_${inn}`, JSON.stringify(docs));
    return docs[docId];
  }
  const form = new FormData();
  form.append('file', file);
  return fetch(`${API_URL}/documents/${docId}`, { method: 'POST', body: form }).then(r => r.json());
}

export async function getDocuments(inn: string) {
  if (USE_MOCK) return JSON.parse(localStorage.getItem(`docs_${inn}`) || '{}');
  return fetch(`${API_URL}/documents?inn=${inn}`).then(r => r.json());
}