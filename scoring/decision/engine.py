from __future__ import annotations

import json
import math
import sys
from dataclasses import dataclass, field
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "recommender"))

from recommender import load_products  # noqa: E402

CONFIG_PATH = HERE / "config.json"

APPROVED = "approved"
COUNTER_OFFER = "counter_offer"
REJECTED = "rejected"
MANUAL_REVIEW = "manual_review"
NEED_INFO = "need_info"


@dataclass
class DecisionInput:
    product_id: str
    amount: int
    term_months: int
    annual_revenue: float | None
    monthly_debt_payments: float = 0.0
    bki_consent: bool = True
    egrul: dict | None = None
    fns: dict | None = None
    bki: dict | None = None
    pd: float | None = None
    risk_factors: list[dict] = field(default_factory=list)
    model_version: str | None = None


def load_config(path: Path = CONFIG_PATH) -> dict:
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def _rub(x: float) -> str:
    return f"{x:,.0f}".replace(",", " ") + " ₽"


def monthly_payment(product: dict, amount: float, term_months: int, cfg: dict) -> float:
    r = product["rate_calc"] / 100 / 12
    if product["payment"] == "annuity":
        return amount * r / (1 - (1 + r) ** -term_months)
    if product["payment"] == "differentiated":
        return amount / term_months + amount * r
    n = cfg["revolving_payoff_months"]
    return amount * r / (1 - (1 + r) ** -n)


def max_affordable_amount(product: dict, budget: float, term_months: int, cfg: dict) -> float:
    if budget <= 0:
        return 0.0
    r = product["rate_calc"] / 100 / 12
    if product["payment"] == "annuity":
        return budget * (1 - (1 + r) ** -term_months) / r
    if product["payment"] == "differentiated":
        return budget / (1 / term_months + r)
    n = cfg["revolving_payoff_months"]
    return budget * (1 - (1 + r) ** -n) / r


def _missing_fields(inp: DecisionInput) -> list[str]:
    missing = []
    if not inp.annual_revenue:
        missing.append("Годовая выручка")
    if not inp.bki_consent:
        missing.append("Согласие на запрос кредитной истории")
    if inp.egrul is None:
        missing.append("Компания с таким ИНН не найдена — проверьте ИНН")
    return missing


def _stop_factors(inp: DecisionInput, cfg: dict) -> list[str]:
    stops = []
    status = (inp.egrul or {}).get("status")
    if status in ("liquidation", "bankruptcy"):
        stops.append("Компания в процессе ликвидации или банкротства")
    if (inp.fns or {}).get("invalid_info_flag"):
        stops.append("В ЕГРЮЛ есть отметка о недостоверности сведений")
    if (inp.bki or {}).get("max_overdue_days_12m", 0) > cfg["stop_overdue_days"]:
        stops.append(f"Просрочка по кредитам больше {cfg['stop_overdue_days']} дней за последний год")
    return stops


def _soft_flags(inp: DecisionInput, cfg: dict) -> list[str]:
    flags = []
    fns, bki = inp.fns or {}, inp.bki or {}
    if fns.get("tax_debt", 0) > 0:
        flags.append(f"Налоговая задолженность {_rub(fns['tax_debt'])}")
    if fns.get("mass_address_flag"):
        flags.append("Массовый адрес регистрации")
    if bki.get("max_overdue_days_12m", 0) > cfg["soft_overdue_days"]:
        flags.append(f"Просрочка {bki['max_overdue_days_12m']} дней за последний год")
    if bki.get("inquiries_6m", 0) > cfg["max_inquiries_6m"]:
        flags.append(f"Много запросов кредитов за полгода: {bki['inquiries_6m']}")
    return flags


def _factor_reasons(inp: DecisionInput, top: int = 3) -> list[str]:
    risky = sorted((f for f in inp.risk_factors if f.get("contribution", 0) > 0),
                   key=lambda f: f["contribution"], reverse=True)
    return [f["name"] for f in risky[:top]]


def decide(inp: DecisionInput, products: list[dict] | None = None, cfg: dict | None = None) -> dict:
    cfg = cfg or load_config()
    products = products or load_products()
    product = next(p for p in products if p["id"] == inp.product_id)

    result = {
        "outcome": None,
        "client_reasons": [],
        "employee_reasons": [],
        "missing_fields": [],
        "flags": [],
        "offer": None,
        "metrics": {},
        "rules_version": cfg["rules_version"],
        "model_version": inp.model_version,
    }

    missing = _missing_fields(inp)
    if missing:
        result.update(outcome=NEED_INFO, missing_fields=missing,
                      client_reasons=["Чтобы рассмотреть заявку, не хватает данных"],
                      employee_reasons=[f"Не хватает: {m}" for m in missing])
        return result

    stops = _stop_factors(inp, cfg)
    if stops:
        result.update(outcome=REJECTED,
                      client_reasons=["Заявка не соответствует требованиям банка к заёмщику"],
                      employee_reasons=[f"Стоп-фактор: {s}" for s in stops])
        return result

    monthly_revenue = inp.annual_revenue / 12
    new_payment = monthly_payment(product, inp.amount, inp.term_months, cfg)
    pti = (inp.monthly_debt_payments + new_payment) / monthly_revenue
    result["metrics"] = {
        "pd": inp.pd,
        "monthly_payment": round(new_payment),
        "payment_to_income": round(pti, 3),
    }
    flags = _soft_flags(inp, cfg)
    result["flags"] = flags

    if inp.pd is None:
        result.update(outcome=MANUAL_REVIEW,
                      client_reasons=["Заявку рассмотрит специалист"],
                      employee_reasons=["Оценка риска недоступна — нужна ручная проверка"])
        return result

    if inp.pd >= cfg["pd_reject_min"]:
        factors = _factor_reasons(inp)
        result.update(outcome=REJECTED,
                      client_reasons=factors or ["Высокий кредитный риск по текущим данным"],
                      employee_reasons=[f"PD {inp.pd:.2f} ≥ порога отказа {cfg['pd_reject_min']}",
                                        *factors])
        return result

    amount, offer_note = inp.amount, None
    if pti > cfg["max_payment_to_income"]:
        budget = cfg["max_payment_to_income"] * monthly_revenue - inp.monthly_debt_payments
        step = cfg["counter_offer_step"]
        affordable = math.floor(max_affordable_amount(product, budget, inp.term_months, cfg) / step) * step
        if affordable < product["amount_min"]:
            result.update(outcome=REJECTED,
                          client_reasons=["Платёж по кредиту будет слишком большим для вашей выручки"],
                          employee_reasons=[f"Платёжная нагрузка {pti:.0%} при допустимых "
                                            f"{cfg['max_payment_to_income']:.0%}, "
                                            f"доступная сумма {_rub(max(affordable, 0))} ниже минимума продукта"])
            return result
        amount = affordable
        offer_note = (f"Платёжная нагрузка {pti:.0%} выше допустимых {cfg['max_payment_to_income']:.0%}. "
                      f"Доступная сумма — {_rub(amount)}")

    pay = monthly_payment(product, amount, inp.term_months, cfg)
    result["offer"] = {
        "product_id": product["id"],
        "product_name": product["name"],
        "amount": amount,
        "term_months": inp.term_months,
        "rate": product["rate_calc"],
        "monthly_payment": round(pay),
    }

    manual = []
    if amount > cfg["manual_review_amount"]:
        manual.append(f"Сумма {_rub(amount)} выше лимита автоматического решения "
                      f"{_rub(cfg['manual_review_amount'])}")
    if inp.pd > cfg["pd_approve_max"]:
        manual.append(f"PD {inp.pd:.2f} в пограничной зоне "
                      f"({cfg['pd_approve_max']}–{cfg['pd_reject_min']})")
    if flags:
        manual.append("Есть сигналы риска: " + "; ".join(flags))

    if manual:
        recommended = "предложить другие условия" if offer_note else "одобрить"
        result.update(outcome=MANUAL_REVIEW,
                      client_reasons=["Заявку рассмотрит специалист. Обычно это занимает до 1 рабочего дня"],
                      employee_reasons=[*manual, *([offer_note] if offer_note else []),
                                        f"Рекомендация системы: {recommended}"])
        return result

    if offer_note:
        result.update(outcome=COUNTER_OFFER,
                      client_reasons=[f"Можем одобрить {_rub(amount)} вместо {_rub(inp.amount)}, "
                                      "чтобы платёж был посильным для вашего бизнеса"],
                      employee_reasons=[offer_note, f"PD {inp.pd:.2f}"])
        return result

    result.update(outcome=APPROVED,
                  client_reasons=["Низкий кредитный риск", "Платёж посилен для вашей выручки"],
                  employee_reasons=[f"PD {inp.pd:.2f} ≤ {cfg['pd_approve_max']}",
                                    f"Платёжная нагрузка {pti:.0%}"])
    return result


if __name__ == "__main__":
    clean = {"egrul": {"status": "active"},
             "fns": {"tax_debt": 0, "invalid_info_flag": False, "mass_address_flag": False},
             "bki": {"max_overdue_days_12m": 0, "inquiries_6m": 1}}
    demo = {
        "1. Хороший клиент, 1 млн": DecisionInput(
            "loan_unsecured", 1_000_000, 24, 24_000_000, 50_000, pd=0.02, **clean),
        "2. Средний риск": DecisionInput(
            "loan_unsecured", 1_000_000, 24, 24_000_000, 50_000, pd=0.11, **clean,
            risk_factors=[{"name": "Короткий срок работы компании", "contribution": 0.15}]),
        "3. Просрочки больше 90 дней": DecisionInput(
            "loan_unsecured", 1_000_000, 24, 24_000_000, 50_000, pd=0.08,
            egrul={"status": "active"}, fns={"tax_debt": 0},
            bki={"max_overdue_days_12m": 120}),
        "3b. Высокий PD": DecisionInput(
            "loan_unsecured", 1_000_000, 24, 24_000_000, 50_000, pd=0.35, **clean,
            risk_factors=[{"name": "Высокая долговая нагрузка", "contribution": 0.28},
                          {"name": "Снижение выручки", "contribution": 0.22}]),
        "4. Хороший клиент, 8 млн": DecisionInput(
            "loan_secured", 8_000_000, 60, 120_000_000, 200_000, pd=0.02, **clean),
        "5. Нет выручки": DecisionInput(
            "loan_unsecured", 1_000_000, 24, None, pd=0.02, **clean),
        "6. Не тянет платёж": DecisionInput(
            "loan_unsecured", 3_000_000, 12, 6_000_000, 40_000, pd=0.03, **clean),
    }
    for title, inp in demo.items():
        r = decide(inp)
        print(f"\n=== {title} → {r['outcome']}")
        if r["offer"]:
            o = r["offer"]
            print(f"  Предложение: {o['product_name']}, {_rub(o['amount'])} на {o['term_months']} мес, "
                  f"{o['rate']}%, платёж {_rub(o['monthly_payment'])}")
        print("  Клиенту:   ", r["client_reasons"])
        print("  Сотруднику:", r["employee_reasons"])