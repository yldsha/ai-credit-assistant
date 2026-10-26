from pathlib import Path

import joblib
import pandas as pd
from catboost import Pool


# Путь к обученной модели в той же папке, что и predict.py
MODEL_PATH = Path(__file__).resolve().parent / "risk_model.joblib"

# Базовые признаки, которые приходят из заявки
BASE_FEATURES = [
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

# Полный список признаков, которые ждёт новая модель
FEATURES = BASE_FEATURES + [
    "expense_ratio",
    "debt_ratio",
    "loan_ratio",
    "collateral_coverage",
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

    # Проверяем наличие только базовых полей
    missing = [feature for feature in BASE_FEATURES if feature not in application]
    if missing:
        raise ValueError(
            f"В заявке отсутствуют обязательные поля: {missing}"
        )

    # Делаем копию, чтобы не изменять исходный словарь
    app = dict(application)
    
    # Добавляем расчёт новых признаков (clip(lower=1) заменяем на max(..., 1))
    app["expense_ratio"] = app["monthly_expenses"] / max(app["monthly_turnover"], 1)
    app["debt_ratio"] = app["monthly_debt_payments"] / max(app["monthly_turnover"], 1)
    app["loan_ratio"] = app["amount"] / max(app["annual_revenue"], 1)
    app["collateral_coverage"] = app["collateral_value"] / max(app["amount"], 1)

    # Передаём модели только признаки в правильном порядке
    X = pd.DataFrame(
        [{feature: app[feature] for feature in FEATURES}],
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


FEATURE_LABELS = {
    "amount": "Сумма кредита",
    "term_months": "Срок кредита",
    "purpose": "Цель кредита",
    "legal_form": "Организационно-правовая форма",
    "has_collateral": "Наличие залога",
    "collateral_type": "Тип залога",
    "business_age_months": "Возраст бизнеса",
    "annual_revenue": "Годовая выручка",
    "monthly_turnover": "Ежемесячный оборот",
    "monthly_expenses": "Ежемесячные расходы",
    "existing_debt": "Текущая задолженность",
    "monthly_debt_payments": "Ежемесячные платежи по долгам",
    "overdue_days": "Дни просрочки",
    "collateral_value": "Стоимость залога",
    "industry": "Отрасль бизнеса",
    # Добавлены метки для новых фичей
    "expense_ratio": "Доля расходов от оборота",
    "debt_ratio": "Долговая нагрузка",
    "loan_ratio": "Отношение кредита к выручке",
    "collateral_coverage": "Покрытие залогом",
}


def predict_with_explanation(
    application: dict,
    top_n: int = 5,
) -> dict:
    """
    Возвращает вероятность дефолта и топ-N факторов SHAP.

    Положительный вклад повышает выход модели, отрицательный — снижает.
    Вклады измеряются в пространстве raw output CatBoost, не в процентах PD.
    """
    if top_n < 1:
        raise ValueError("top_n должен быть не меньше 1")

    # Проверяем заявку и получаем вероятность дефолта (там же проверяются поля)
    pd_value = predict_pd(application)

    # Обогащаем заявку для создания DataFrame под SHAP
    app = dict(application)
    app["expense_ratio"] = app["monthly_expenses"] / max(app["monthly_turnover"], 1)
    app["debt_ratio"] = app["monthly_debt_payments"] / max(app["monthly_turnover"], 1)
    app["loan_ratio"] = app["amount"] / max(app["annual_revenue"], 1)
    app["collateral_coverage"] = app["collateral_value"] / max(app["amount"], 1)

    X = pd.DataFrame(
        [{feature: app[feature] for feature in FEATURES}],
        columns=FEATURES,
    )

    for feature in CATEGORICAL_FEATURES:
        X[feature] = X[feature].astype(str)

    # CatBoost возвращает SHAP-вклады признаков и базовое значение
    pool = Pool(
        data=X,
        cat_features=CATEGORICAL_FEATURES,
        feature_names=FEATURES,
    )

    shap_values = model.get_feature_importance(
        data=pool,
        type="ShapValues",
    )

    contributions = shap_values[0][:-1]

    ranked = sorted(
        zip(FEATURES, contributions),
        key=lambda item: abs(float(item[1])),
        reverse=True,
    )[:top_n]

    risk_factors = [
        {
            "feature": feature,
            "label": FEATURE_LABELS[feature],
            "contribution": float(value),
            "direction": (
                "increases_risk" if value > 0
                else "decreases_risk" if value < 0
                else "neutral"
            ),
        }
        for feature, value in ranked
    ]

    return {
        "pd": pd_value,
        "risk_factors": risk_factors,
    }