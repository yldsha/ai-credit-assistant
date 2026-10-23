
from pathlib import Path

import joblib
import pandas as pd


# Путь к обученной модели в той же папке, что и predict.py
MODEL_PATH = Path(__file__).resolve().parent / "risk_model.joblib"

# Признаки должны совпадать с теми, на которых обучалась модель
FEATURES = [
    "amount",
    "term_months",
    "purpose",
    "legal_form",
    "has_collateral",
    "collateral_type",
    "business_age_months",
    "annual_revenue",
    "monthly_turnover",
    "monthly_expenses",
    "existing_debt",
    "monthly_debt_payments",
    "overdue_days",
    "collateral_value",
    "industry",
]

# Категориальные признаки, использованные при обучении CatBoost
CATEGORICAL_FEATURES = [
    "purpose",
    "legal_form",
    "collateral_type",
    "industry",
]

# Загружаем модель один раз при импорте модуля
if not MODEL_PATH.exists():
    raise FileNotFoundError(
        f"Файл модели не найден: {MODEL_PATH}"
    )

model = joblib.load(MODEL_PATH)


def predict_pd(application: dict) -> float:
    """
    Рассчитывает вероятность дефолта в течение 12 месяцев.

    Args:
        application: словарь с 15 признаками заявки.

    Returns:
        PD — вероятность дефолта от 0 до 1.
    """
    if not isinstance(application, dict):
        raise TypeError("application должен быть словарём")

    missing = [feature for feature in FEATURES if feature not in application]
    if missing:
        raise ValueError(
            f"В заявке отсутствуют обязательные поля: {missing}"
        )

    # Передаём модели только признаки в правильном порядке
    X = pd.DataFrame(
        [{feature: application[feature] for feature in FEATURES}],
        columns=FEATURES,
    )

    # CatBoost ожидает категориальные значения в совместимом формате
    for feature in CATEGORICAL_FEATURES:
        if pd.isna(X.at[0, feature]):
            raise ValueError(
                f"Категориальный признак '{feature}' не может быть пустым"
            )
        X[feature] = X[feature].astype(str)

    # Получаем вероятность класса 1 — дефолта
    probabilities = model.predict_proba(X)
    pd_value = float(probabilities[0][1])

    if not 0.0 <= pd_value <= 1.0:
        raise ValueError(f"Некорректное значение PD: {pd_value}")

    return pd_value
