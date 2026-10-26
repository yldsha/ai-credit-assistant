import { fetchRecommendations } from './api';

export interface RecommendParams {
  type: 'ООО' | 'ИП';
  collateral: 'С залогом' | 'Без залога';
  businessAgeCategory: 'До 9 месяцев' | 'Более 9 месяцев';
  amount: number;
  termYears: number;
  purpose?: string; // Добавили цель, так как она важна для подбора
}

export async function recommendProducts(params: RecommendParams) {
  try {
    // 1. Отправляем параметры на бэкенд (POST /recommend)
    // Бэкенд сам применяет правила фильтрации и сортирует через логистическую регрессию
    const data = await fetchRecommendations({
      ...params,
      businessAgeMonths: params.businessAgeCategory === 'Более 9 месяцев' ? 24 : 6,
    });

    // 2. Адаптируем ответ бэкенда под формат, который ждет наш React-компонент
    if (!data || !data.recommendations) return [];

    return data.recommendations.map((rec: any) => ({
      product: {
        id: rec.product_id,
        name: rec.name,
        // Бэкенд отдает причины в поле reasons или pitch
        desc: rec.pitch || (rec.reasons && rec.reasons.length > 0 ? rec.reasons[0] : 'Кредит для бизнеса'),
        rate: rec.rate_from || 19,
        // Метка от бэкенда: "Лучший вариант", "Тоже подходит", "Альтернатива"
        label: rec.label,
        // Сохраняем причины для возможного вывода в UI
        reasons: rec.reasons || [],
        icon: 'credit'
      },
      // Бэкенд отдает платеж в виде объекта { monthly: 12345, overpayment: 6789 }
      payment: rec.payment?.monthly || 0,
      overpayment: rec.payment?.overpayment || 0,
    }));

  } catch (error) {
    console.error('Ошибка при получении рекомендаций:', error);
    // Если бэкенд недоступен, возвращаем пустой массив
    return [];
  }
}