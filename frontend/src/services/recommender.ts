import { products } from '../mocks/mockData';

export interface RecommendParams {
  type: 'ООО' | 'ИП';
  collateral: 'С залогом' | 'Без залога';
  businessAgeCategory: 'До 9 месяцев' | 'Более 9 месяцев';
  amount: number;
  termYears: number;
}

export function recommendProducts(params: RecommendParams) {
  const termMonths = params.termYears * 12;
  const businessAgeMonths = params.businessAgeCategory === 'Более 9 месяцев' ? 12 : 6;

  const filtered = products.filter(p =>
    p.types.includes(params.type) &&
    p.collateral === params.collateral &&
    params.amount >= p.minAmount && params.amount <= p.maxAmount &&
    termMonths >= p.minTerm && termMonths <= p.maxTerm &&
    businessAgeMonths >= p.minBusinessAge
  );

  return filtered.map(p => {
    const monthlyRate = p.rate / 100 / 12;
    const payment = params.amount * (monthlyRate * Math.pow(1 + monthlyRate, termMonths)) / (Math.pow(1 + monthlyRate, termMonths) - 1);
    const totalAmount = payment * termMonths;
    const overpayment = totalAmount - params.amount;

    return {
      product: p,
      payment: isNaN(payment) || !isFinite(payment) ? 0 : Math.round(payment),
      overpayment: isNaN(overpayment) || !isFinite(overpayment) ? 0 : Math.round(overpayment),
    };
  }).sort((a, b) => a.product.rate - b.product.rate);
}