export interface RecommendParams {
  type: 'ООО' | 'ИП';
  collateral: 'С залогом' | 'Без залога';
  businessAgeCategory: 'До 9 месяцев' | 'Более 9 месяцев';
  amount: number;
  termYears: number;
}

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

// Теперь эта функция асинхронная, так как делает запрос к API Кости
export async function recommendProducts(params: RecommendParams) {
  try {
    // 1. Запрашиваем актуальный каталог продуктов с бэкенда
    const response = await fetch(`${API_URL}/products`);
    if (!response.ok) throw new Error('Ошибка загрузки каталога');
    const products = await response.json();

    const termMonths = params.termYears * 12;
    const businessAgeMonths = params.businessAgeCategory === 'Более 9 месяцев' ? 12 : 6;
    const legalForm = params.type === 'ООО' ? 'OOO' : 'IP';
    const collateralType = params.collateral === 'С залогом' ? 'real_estate' : 'none';

    // 2. Фильтруем продукты по правилам (Костя делает это на Python,
    // но для мгновенного отклика ползунков мы делаем это на фронте)
    const filtered = products.filter((p: any) => {
      // Проверка на лимиты
      const matchAmount = params.amount >= (p.min_amount || 50000) && params.amount <= (p.max_amount || 30000000);
      const matchTerm = termMonths >= (p.min_term_months || 3) && termMonths <= (p.max_term_months || 120);
      // Проверка на залог (если у продукта указано требование залога)
      const matchCollateral = p.collateral_required ? collateralType !== 'none' : true;

      return matchAmount && matchTerm && matchCollateral;
    });

    // 3. Рассчитываем платеж и переплату (используем ставку из каталога Кости)
    return filtered.map((p: any) => {
      // Костя отдает ставку в поле rate_calc (например, 15.5)
      const rate = p.rate_calc || 19;
      const monthlyRate = rate / 100 / 12;

      const payment = params.amount * (monthlyRate * Math.pow(1 + monthlyRate, termMonths)) / (Math.pow(1 + monthlyRate, termMonths) - 1);
      const totalAmount = payment * termMonths;
      const overpayment = totalAmount - params.amount;

      return {
        product: {
          ...p,
          // Адаптируем названия полей под то, что ждет наш фронтенд
          id: p.id,
          name: p.name,
          desc: p.description || 'Кредит для бизнеса',
          rate: rate,
          icon: 'credit',
        },
        payment: isNaN(payment) || !isFinite(payment) ? 0 : Math.round(payment),
        overpayment: isNaN(overpayment) || !isFinite(overpayment) ? 0 : Math.round(overpayment),
      };
    }).sort((a: any, b: any) => a.product.rate - b.product.rate);

  } catch (error) {
    console.error('Ошибка при получении рекомендаций:', error);
    // Если бэкенд недоступен, возвращаем пустой массив,
    // чтобы UI показал заглушку "Не нашли подходящий продукт"
    return [];
  }
}