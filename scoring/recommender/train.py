from __future__ import annotations

from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, classification_report, top_k_accuracy_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import FunctionTransformer, OneHotEncoder, StandardScaler

from recommender import PURPOSES, Request, fit_score, is_eligible, load_products

MODEL_PATH = Path(__file__).with_name("model.joblib")
SEED = 42
N = 20_000
LABEL_NOISE = 0.15

CATEGORICAL = ["purpose", "legal_form", "collateral_type"]
NUMERIC = ["log_amount", "term_months", "business_age_months", "has_collateral"]


def generate_requests(n: int, rng: np.random.Generator) -> list[Request]:
    purposes = list(PURPOSES)
    requests = []
    for _ in range(n):
        has_collateral = bool(rng.random() < 0.4)
        requests.append(Request(
            amount=int(np.clip(rng.lognormal(np.log(2_000_000), 1.1), 50_000, 60_000_000)),
            term_months=int(rng.choice([6, 12, 18, 24, 36, 48, 60, 84, 120])),
            purpose=str(rng.choice(purposes)),
            legal_form=str(rng.choice(["IP", "OOO"], p=[0.55, 0.45])),
            business_age_months=int(np.clip(rng.gamma(2.0, 20), 1, 240)),
            has_collateral=has_collateral,
            collateral_type=(str(rng.choice(["real_estate", "vehicle", "equipment"]))
                             if has_collateral else None),
        ))
    return requests


def label(req: Request, products: list[dict], rng: np.random.Generator) -> str | None:
    candidates = [(fit_score(req, p) + rng.normal(0, LABEL_NOISE), p["id"])
                  for p in products if is_eligible(req, p).ok]
    if not candidates:
        return None
    return max(candidates)[1]


def to_frame(requests: list[Request]) -> pd.DataFrame:
    df = pd.DataFrame([r.__dict__ for r in requests])
    df["log_amount"] = np.log(df["amount"])
    df["has_collateral"] = df["has_collateral"].astype(int)
    df["collateral_type"] = df["collateral_type"].fillna("none")
    return df[CATEGORICAL + NUMERIC]


def build_model() -> Pipeline:
    pre = ColumnTransformer([
        ("cat", OneHotEncoder(handle_unknown="ignore"), CATEGORICAL),
        ("num", StandardScaler(), NUMERIC),
    ])
    return Pipeline([
        ("pre", pre),
        ("clf", LogisticRegression(max_iter=2000, C=1.0)),
    ])


def main() -> None:
    rng = np.random.default_rng(SEED)
    products = load_products()

    requests, labels = [], []
    for req in generate_requests(N, rng):
        y = label(req, products, rng)
        if y is not None:
            requests.append(req)
            labels.append(y)

    X = to_frame(requests)
    y = np.array(labels)
    X_tr, X_te, y_tr, y_te = train_test_split(X, y, test_size=0.2, random_state=SEED, stratify=y)

    model = build_model().fit(X_tr, y_tr)
    proba = model.predict_proba(X_te)
    classes = model.classes_

    print(f"Обучающих примеров: {len(X_tr)}, тестовых: {len(X_te)}")
    print("Распределение меток:", pd.Series(y).value_counts(normalize=True).round(3).to_dict())
    print(f"Top-1 accuracy: {accuracy_score(y_te, classes[proba.argmax(1)]):.3f}")
    print(f"Top-3 accuracy: {top_k_accuracy_score(y_te, proba, k=3, labels=classes):.3f}")
    print(classification_report(y_te, classes[proba.argmax(1)], digits=3))

    joblib.dump(model, MODEL_PATH)
    print(f"Модель сохранена: {MODEL_PATH.name}")


if __name__ == "__main__":
    main()