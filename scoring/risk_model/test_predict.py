from predict import predict_pd

application = {
    "amount": 2_000_000,
    "term_months": 36,
    "purpose": "working_capital",
    "legal_form": "OOO",
    "has_collateral": True,
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

pd_value = predict_pd(application)

print(f"PD: {pd_value:.4f}")
print(f"Вероятность дефолта: {pd_value * 100:.2f}%")
