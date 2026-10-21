from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path

PRODUCTS_PATH = Path(__file__).with_name("products.json")

PURPOSES = {
    "cash_gap": "кассовый разрыв, налоги, оплата поставщику",
    "inventory": "закупка товара, сезонные закупки",
    "working_capital": "пополнение оборотных средств",
    "equipment": "покупка оборудования",
    "development": "развитие бизнеса, новое направление",
    "refinancing": "рефинансирование кредитов",
    "transport": "покупка транспорта или спецтехники",
    "real_estate": "покупка недвижимости",
}

LEGAL_FORMS = {"IP": "ИП", "OOO": "ООО"}

WEAK_FIT = 0.5


@dataclass
class Request:
    amount: int
    term_months: int
    purpose: str
    legal_form: str
    business_age_months: int
    has_collateral: bool = False
    collateral_type: str | None = None


@dataclass
class Check:
    ok: bool
    reasons: list[str] = field(default_factory=list)
    blockers: list[str] = field(default_factory=list)


def load_products(path: Path = PRODUCTS_PATH) -> list[dict]:
    with open(path, encoding="utf-8") as f:
        return json.load(f)["products"]


def _rub(x: float) -> str:
    return f"{x:,.0f}".replace(",", " ") + " ₽"


def is_eligible(req: Request, p: dict) -> Check:
    blockers: list[str] = []
    reasons: list[str] = []

    if req.amount < p["amount_min"]:
        blockers.append(f"Минимальная сумма — {_rub(p['amount_min'])}")
    elif req.amount > p["amount_max"]:
        blockers.append(f"Максимальная сумма — {_rub(p['amount_max'])}")
    else:
        reasons.append(f"Сумма {_rub(req.amount)} в пределах лимита до {_rub(p['amount_max'])}")

    if p["kind"] == "installment":
        if req.term_months > p["term_max_months"]:
            blockers.append(f"Максимальный срок — {p['term_max_months'] // 12} лет")
        elif req.term_months < p["term_min_months"]:
            blockers.append(f"Минимальный срок — {p['term_min_months']} мес")

    min_age = p["min_business_age_months"][req.legal_form]
    if req.business_age_months < min_age:
        blockers.append(
            f"Для {LEGAL_FORMS[req.legal_form]} нужен срок работы бизнеса от {min_age} мес"
        )

    col = p["collateral"]
    if col == "required":
        if not req.has_collateral:
            blockers.append("Нужен залог")
        elif req.collateral_type and req.collateral_type not in p["collateral_types"]:
            blockers.append("Этот вид залога не принимается")
        else:
            reasons.append("Ваш залог снижает ставку")
    elif col == "forbidden":
        reasons.append("Залог не нужен")
    elif col == "purchased_asset":
        if req.purpose != "transport":
            blockers.append("Только на покупку транспорта или спецтехники")
        else:
            reasons.append("Залогом станет сам транспорт — отдельный залог не нужен")

    if p["purpose_fit"].get(req.purpose, 0) == 0 and col != "purchased_asset":
        blockers.append(f"Не предназначен для цели «{PURPOSES[req.purpose]}»")

    return Check(ok=not blockers, reasons=reasons, blockers=blockers)


def fit_score(req: Request, p: dict) -> float:
    score = p["purpose_fit"].get(req.purpose, 0.0)
    short_need = req.purpose in ("cash_gap", "inventory", "working_capital")
    if p["kind"] == "revolving" and short_need:
        score += 0.1
    if p["kind"] == "installment" and req.term_months >= 36 and not short_need:
        score += 0.05
    if p["collateral"] == "required" and req.has_collateral:
        score += 0.05
    if p["id"] == "money_for_business" and req.business_age_months < 9:
        score += 0.15
    return min(score, 1.0)


def payment(req: Request, p: dict) -> dict:
    r = p["rate_calc"] / 100 / 12
    s, n = req.amount, req.term_months
    if p["payment"] == "annuity":
        m = s * r / (1 - (1 + r) ** -n)
        return {"type": "annuity", "monthly": round(m), "overpayment": round(m * n - s)}
    if p["payment"] == "differentiated":
        first = s / n + s * r
        return {"type": "differentiated", "first_payment": round(first),
                "overpayment": round(s * r * (n + 1) / 2)}
    return {"type": "revolving", "monthly_interest_full_use": round(s * r)}


def _label(score: float, rank: int) -> str:
    if score >= 0.8 and rank == 0:
        return "Лучший вариант"
    if score >= 0.5:
        return "Тоже подходит"
    return "Альтернатива"


def _purpose_reason(req: Request, p: dict) -> str | None:
    fit = p["purpose_fit"].get(req.purpose, 0)
    if fit >= 0.8:
        return f"Создан для цели «{PURPOSES[req.purpose]}»"
    if fit >= 0.5:
        return f"Подходит для цели «{PURPOSES[req.purpose]}»"
    return None


def _suggestions(req: Request, products: list[dict]) -> list[str]:
    tips = []
    variants = [
        ("Добавьте залог — станут доступны", Request(**{**req.__dict__, "has_collateral": True,
                                                        "collateral_type": "real_estate"})),
        ("Уменьшите срок до 5 лет — станут доступны", Request(**{**req.__dict__,
                                                                 "term_months": min(req.term_months, 60)})),
        ("Уменьшите сумму до 20 млн ₽ — станут доступны", Request(**{**req.__dict__,
                                                                     "amount": min(req.amount, 20_000_000)})),
    ]
    already = {p["id"] for p in products if is_eligible(req, p).ok}
    for text, alt in variants:
        names = [p["name"] for p in products
                 if p["id"] not in already and is_eligible(alt, p).ok]
        if names and alt != req:
            tips.append(f"{text}: {', '.join(names)}")
    return tips


def recommend(req: Request, products: list[dict] | None = None, top_k: int = 3) -> dict:
    products = products or load_products()
    eligible, excluded = [], []

    for p in products:
        check = is_eligible(req, p)
        if check.ok:
            eligible.append((fit_score(req, p), p, check))
        else:
            excluded.append({"product_id": p["id"], "name": p["name"], "reasons": check.blockers})

    eligible.sort(key=lambda t: t[0], reverse=True)
    recs = []
    for i, (score, p, check) in enumerate(eligible[:top_k]):
        reasons = [r for r in [_purpose_reason(req, p), *check.reasons] if r]
        recs.append({
            "product_id": p["id"],
            "name": p["name"],
            "label": _label(score, i),
            "score": round(score, 2),
            "rate_from": p["rate_calc"],
            "payment": payment(req, p),
            "pitch": p["pitch"],
            "reasons": reasons,
        })

    return {
        "recommendations": recs,
        "excluded": excluded,
        "suggestions": (_suggestions(req, products)
                        if not recs or recs[0]["score"] < WEAK_FIT else []),
    }


if __name__ == "__main__":
    demo = {
        "ООО, оборудование, 1,5 млн на 2 года": Request(1_500_000, 24, "equipment", "OOO", 30),
        "ИП, кассовый разрыв, 600 тыс.": Request(600_000, 12, "cash_gap", "IP", 12),
        "Молодое ООО, без залога": Request(1_000_000, 36, "development", "OOO", 5),
        "Молодое ООО, залог недвижимость": Request(5_900_000, 36, "development", "OOO", 5,
                                                   True, "real_estate"),
        "ООО, грузовик": Request(4_000_000, 60, "transport", "OOO", 24),
        "ООО, без залога, 6 лет": Request(1_300_000, 72, "development", "OOO", 24),
    }
    products = load_products()
    for title, req in demo.items():
        res = recommend(req, products)
        print(f"\n=== {title}")
        for r in res["recommendations"]:
            print(f"  [{r['label']}] {r['name']} — {r['score']} | {r['payment']}")
            for reason in r["reasons"]:
                print(f"      + {reason}")
        for tip in res["suggestions"]:
            print(f"  ? {tip}")