from predict import predict_pd, predict_with_explanation
import json

application = {
    "amount": 2_000_000,
    "term_months": 36,
    "purpose": "working_capital",
    "legal_form": "OOO",
    "has_collateral": 1,  # Передаем 1 вместо True, строго как на этапе обучения
    "collateral_type": "real_estate",
    "business_age_months": 48,
    "annual_revenue": 15_000_000,
    "monthly_turnover": 1_250_000,
    "monthly_expenses": 800_000,
    "existing_debt": 1_000_000,
    "monthly_debt_payments": 50_000,
    "overdue_days": 0,
    "collateral_value": 2_500_000,
    "industry": "trade",
}

# 1. Простой расчет (как было у тебя)
pd_value = predict_pd(application)
print("=== Базовый скоринг ===")
print(f"PD: {pd_value:.4f}")
print(f"Вероятность дефолта: {pd_value * 100:.2f}%\n")

# 2. Расширенный расчет с объяснимостью (Explainable AI)
print("=== Скоринг с интерпретацией факторов (SHAP) ===")
explanation_result = predict_with_explanation(application, top_n=3)

print(f"Итоговая вероятность: {explanation_result['pd'] * 100:.2f}%")
print("Топ-3 фактора, повлиявших на решение:")

for factor in explanation_result["risk_factors"]:
    # Добавляем наглядные эмодзи для консоли
    if factor["direction"] == "increases_risk":
        direction_icon = "🔴 Повышает риск"
    elif factor["direction"] == "decreases_risk":
        direction_icon = "🟢 Снижает риск"
    else:
        direction_icon = "⚪ Нейтрально"
        
    print(f" • {factor['label']}: {factor['contribution']:.3f} ({direction_icon})")