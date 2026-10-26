import asyncio
import json
import os
import sys
from datetime import date, datetime
from pathlib import Path
from typing import Any, Literal

import httpx
from fastapi import BackgroundTasks, Body, Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

# ==================== ПУТИ ИМПОРТА (ВКЛЮЧАЯ scoring/risk_model) ====================
BASE_DIR = Path(__file__).resolve().parent
for sub in (
    BASE_DIR,
    BASE_DIR / "scoring",
    BASE_DIR / "scoring" / "risk_model",
    BASE_DIR / "scoring" / "recommender",
    BASE_DIR / "scoring" / "decision",
    BASE_DIR.parent / "scoring",
    BASE_DIR.parent / "scoring" / "risk_model",
    BASE_DIR.parent / "scoring" / "recommender",
    BASE_DIR.parent / "scoring" / "decision",
):
    if sub.exists() and str(sub) not in sys.path:
        sys.path.insert(0, str(sub))

from models import Application, SessionLocal, StatusHistory, User, init_db  # noqa: E402
from recommender import Request as RecRequest, load_products, recommend  # noqa: E402
from engine import DecisionInput, decide, load_config, monthly_payment  # noqa: E402

try:
    from predict import FEATURES, predict_with_explanation  # noqa: E402
except Exception as predict_import_err:
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
    _PREDICT_IMPORT_ERROR = predict_import_err

    def predict_with_explanation(application: dict, top_n: int = 5) -> dict:
        raise RuntimeError(
            f"Модель риска не загружена ({_PREDICT_IMPORT_ERROR})"
        )


MOCKS_BASE_URL = os.getenv("MOCKS_BASE_URL", "http://mocks:8001")

# ==================== КОНТРОЛЬ ПЕРЕХОДОВ СТАТУСОВ ====================

ALLOWED_EMPLOYEE_DECISION_STATUSES = {
    "manual_review",
    "need_info",
    "checking",
    "scoring",
}

POST_APPROVAL_ACTIONS: dict[str, dict[str, Any]] = {
    "accept_offer": {
        "allowed_from": {"approved", "counter_offer"},
        "new_status": "offer_accepted",
        "comment": "Клиент принял кредитное предложение",
    },
    "sign_contract": {
        "allowed_from": {"approved", "counter_offer", "offer_accepted"},
        "new_status": "contract_signed",
        "comment": "Кредитный договор подписан клиентом по ЭДО",
    },
    "disburse": {
        "allowed_from": {"approved", "offer_accepted", "contract_signed"},
        "new_status": "disbursed",
        "comment": "Кредитные средства зачислены на расчётный счёт клиента (выдан)",
    },
}

# Хардкод PD для 5 демо-клиентов из seed.json (для остальных вызывается модель Даши)
DEMO_PD_HARDCODE: dict[str, dict[str, Any]] = {
    "770200000001": {
        "pd": 0.02,
        "risk_factors": [
            {
                "feature": "overdue_days",
                "label": "Отсутствие просрочек в БКИ",
                "name": "Отсутствие просрочек в БКИ",
                "contribution": -0.04,
                "direction": "decreases_risk",
            },
            {
                "feature": "business_age_months",
                "label": "Стабильный срок работы бизнеса",
                "name": "Стабильный срок работы бизнеса",
                "contribution": -0.02,
                "direction": "decreases_risk",
            },
        ],
    },
    "7702000001": {
        "pd": 0.02,
        "risk_factors": [
            {
                "feature": "overdue_days",
                "label": "Отсутствие просрочек в БКИ",
                "name": "Отсутствие просрочек в БКИ",
                "contribution": -0.04,
                "direction": "decreases_risk",
            }
        ],
    },
    "7702000002": {
        "pd": 0.09,
        "risk_factors": [
            {
                "feature": "monthly_turnover",
                "label": "Нестабильные обороты относительно запрашиваемой суммы",
                "name": "Нестабильные обороты относительно запрашиваемой суммы",
                "contribution": 0.05,
                "direction": "increases_risk",
            }
        ],
    },
    "770200000003": {
        "pd": 0.23,
        "risk_factors": [
            {
                "feature": "overdue_days",
                "label": "Длительные просрочки за последние 12 месяцев (45 дней)",
                "name": "Длительные просрочки за последние 12 месяцев (45 дней)",
                "contribution": 0.14,
                "direction": "increases_risk",
            },
            {
                "feature": "existing_debt",
                "label": "Высокая кредитная нагрузка и частые запросы в БКИ",
                "name": "Высокая кредитная нагрузка и частые запросы в БКИ",
                "contribution": 0.06,
                "direction": "increases_risk",
            },
        ],
    },
    "7702000003": {
        "pd": 0.23,
        "risk_factors": [
            {
                "feature": "overdue_days",
                "label": "Длительные просрочки за последние 12 месяцев (45 дней)",
                "name": "Длительные просрочки за последние 12 месяцев (45 дней)",
                "contribution": 0.14,
                "direction": "increases_risk",
            }
        ],
    },
    "7702000004": {
        "pd": 0.03,
        "risk_factors": [
            {
                "feature": "business_age_months",
                "label": "Длительный срок существования компании (с 2015 г.)",
                "name": "Длительный срок существования компании (с 2015 г.)",
                "contribution": -0.05,
                "direction": "decreases_risk",
            }
        ],
    },
    "7702000005": {
        "pd": 0.04,
        "risk_factors": [
            {
                "feature": "annual_revenue",
                "label": "Требуется подтверждение годовой выручки и финансовой отчётности",
                "name": "Требуется подтверждение годовой выручки и финансовой отчётности",
                "contribution": 0.03,
                "direction": "increases_risk",
            }
        ],
    },
}

DEFAULT_ENGINE_CONFIG = {
    "rules_version": "rules-v1.0",
    "revolving_payoff_months": 12,
    "stop_overdue_days": 90,
    "soft_overdue_days": 30,
    "max_inquiries_6m": 5,
    "pd_approve_max": 0.05,
    "pd_reject_min": 0.15,
    "max_payment_to_income": 0.50,
    "counter_offer_step": 50000,
    "manual_review_amount": 3000000,
}


def get_engine_config() -> dict[str, Any]:
    try:
        return load_config()
    except FileNotFoundError:
        return DEFAULT_ENGINE_CONFIG


# ==================== СЕТЕВЫЕ ЗАПРОСЫ К МИКРОСЕРВИСУ МОКОВ ====================


async def fetch_mock_endpoint(
    endpoint: str,
    timeout: float = 3.0,
    retries: int = 1,
) -> httpx.Response:
    """
    Асинхронный HTTP-запрос к микросервису моков с таймаутом 3 секунды и 1 ретраем.
    """
    url = f"{MOCKS_BASE_URL.rstrip('/')}/{endpoint.lstrip('/')}"
    last_exc: Exception | None = None

    for attempt in range(retries + 1):
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                response = await client.get(url)
                if response.status_code >= 500 and attempt < retries:
                    await asyncio.sleep(0.2)
                    continue
                return response
        except httpx.RequestError as exc:
            last_exc = exc
            if attempt < retries:
                await asyncio.sleep(0.2)
                continue
            raise

    raise RuntimeError(f"Не удалось выполнить запрос к {url}: {last_exc}")


async def fetch_egrul_http(inn: str) -> dict[str, Any] | None:
    try:
        resp = await fetch_mock_endpoint(f"/egrul/{inn}")
        if resp.status_code == 200:
            data = resp.json()
            if "name" in data and "company_name" not in data:
                data["company_name"] = data["name"]
            return data
    except Exception:
        pass
    return None


def calculate_business_age_months(
    registration_date_str: str | None,
    fallback: int = 12,
) -> int:
    if not registration_date_str:
        return fallback
    try:
        reg_date = datetime.strptime(registration_date_str, "%Y-%m-%d").date()
        today = date.today()
        months = (today.year - reg_date.year) * 12 + (today.month - reg_date.month)
        if today.day < reg_date.day:
            months -= 1
        return max(0, months)
    except Exception:
        return fallback


def format_recommendations_for_client(
    rec_result: dict[str, Any],
    products: list[dict[str, Any]],
    amount: int,
    term_months: int,
) -> dict[str, Any]:
    """
    Форматирует ответ recommend() для клиентского фронтенда:
    гарантирует наличие полей product_id, name, label («Лучший вариант» / «Альтернатива»),
    rate_from, payment (monthly, overpayment) и reasons, а также скрывает служебные score/ranked_by.
    """
    prod_map = {p["id"]: p for p in products}
    cfg = get_engine_config()
    clean_recs: list[dict[str, Any]] = []

    for idx, r in enumerate(rec_result.get("recommendations", [])):
        r_copy = {k: v for k, v in r.items() if k not in ("score", "ranked_by")}
        pid = r_copy.get("product_id") or r_copy.get("id")
        prod = prod_map.get(pid, {})

        r_copy["product_id"] = pid
        r_copy["name"] = r_copy.get("name") or prod.get("name", "")
        r_copy["label"] = r_copy.get("label") or (
            "Лучший вариант" if idx == 0 else "Альтернатива"
        )
        r_copy["rate_from"] = (
            r_copy.get("rate_from")
            if r_copy.get("rate_from") is not None
            else prod.get("rate_from", prod.get("rate_calc", 0))
        )

        # Гарантируем структуру payment: {monthly, overpayment}
        payment_obj = r_copy.get("payment")
        if not isinstance(payment_obj, dict) or "monthly" not in payment_obj:
            monthly_val = (
                round(monthly_payment(prod, amount, term_months, cfg))
                if prod
                else 0
            )
            overpayment_val = max(0, monthly_val * term_months - amount)
            r_copy["payment"] = {
                "monthly": monthly_val,
                "overpayment": overpayment_val,
            }

        r_copy["reasons"] = r_copy.get("reasons") or []
        clean_recs.append(r_copy)

    return {
        "recommendations": clean_recs,
        "excluded": rec_result.get("excluded", []),
        "suggestions": rec_result.get("suggestions", []),
    }


# ==================== ИНИЦИАЛИЗАЦИЯ ПРИЛОЖЕНИЯ ====================

app = FastAPI(
    title="Alfa SME Credit Pipeline API",
    description="Бэкенд конвейера кредитных заявок МСБ (FastAPI + ML Scoring + Decision Engine)",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup() -> None:
    cfg_path = BASE_DIR / "config.json"
    scoring_cfg_path = BASE_DIR / "scoring" / "decision" / "config.json"
    if not cfg_path.exists() and not scoring_cfg_path.exists():
        cfg_path.write_text(
            json.dumps(DEFAULT_ENGINE_CONFIG, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
    init_db()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def record_status_change(
    db: Session,
    application: Application,
    new_status: str,
    changed_by: str,
    comment: str | None = None,
) -> None:
    old_status = application.status
    application.status = new_status
    history_entry = StatusHistory(
        application_id=application.id,
        old_status=old_status,
        new_status=new_status,
        changed_by=changed_by,
        comment=comment,
    )
    db.add(history_entry)
    db.commit()
    db.refresh(application)


def extract_15_features(app_obj: Application) -> dict[str, Any]:
    """
    Строгий маппинг 15 полей заявки в словарь для модели scoring/risk_model/predict.py.
    Поле purpose передаётся напрямую из заявки (например, cash_gap, equipment, working_capital).
    """
    collateral_type_val = (
        app_obj.collateral_type
        if app_obj.has_collateral and app_obj.collateral_type
        else "none"
    )
    annual_rev = (
        float(app_obj.annual_revenue)
        if app_obj.annual_revenue is not None
        else float(app_obj.monthly_turnover or 0.0) * 12.0
    )

    payload = {
        "amount": int(app_obj.amount),
        "term_months": int(app_obj.term_months),
        "purpose": str(app_obj.purpose),
        "legal_form": str(app_obj.legal_form),
        "has_collateral": int(bool(app_obj.has_collateral)),
        "collateral_type": str(collateral_type_val),
        "business_age_months": int(app_obj.business_age_months),
        "annual_revenue": annual_rev,
        "monthly_turnover": float(app_obj.monthly_turnover),
        "monthly_expenses": float(app_obj.monthly_expenses),
        "existing_debt": float(app_obj.existing_debt),
        "monthly_debt_payments": float(app_obj.monthly_debt_payments),
        "overdue_days": int(app_obj.overdue_days),
        "collateral_value": float(app_obj.collateral_value),
        "industry": str(app_obj.industry or "trade"),
    }

    return {feature: payload[feature] for feature in FEATURES}


# ==================== PYDANTIC СХЕМЫ ====================


class RecommendRequestPayload(BaseModel):
    amount: int = Field(..., gt=0, example=1500000)
    term_months: int = Field(..., gt=0, example=24)
    purpose: str = Field(..., example="equipment")
    legal_form: Literal["IP", "OOO"] = Field(default="OOO", example="OOO")
    has_collateral: bool = Field(default=False, example=False)
    collateral_type: str | None = Field(default="none", example="none")
    business_age_months: int = Field(default=24, ge=0, example=24)


class DraftApplicationCreate(BaseModel):
    client_id: int | None = Field(default=1, description="ID пользователя-клиента")
    inn: str | None = Field(default="770200000001", description="ИНН компании")
    product_id: str | None = Field(
        default=None,
        description="Выбранный клиентом продукт (сохраняется в БД и передаётся в decide())",
    )
    bki_consent: bool = Field(default=True, description="Согласие на запрос в БКИ")

    # 15 признаков для predict.py (annual_revenue по умолчанию None!)
    amount: int = Field(..., gt=0, example=1500000)
    term_months: int = Field(..., gt=0, example=24)
    purpose: str = Field(..., example="equipment")
    legal_form: Literal["IP", "OOO"] = Field(..., example="OOO")
    has_collateral: bool = Field(default=False, example=False)
    collateral_type: str | None = Field(default="none", example="none")
    business_age_months: int = Field(default=24, ge=0, example=24)
    annual_revenue: float | None = Field(
        default=None,
        description="Годовая выручка (если не указана — None, сработает сценарий need_info)",
    )
    monthly_turnover: float = Field(default=2000000.0, ge=0, example=2000000.0)
    monthly_expenses: float = Field(default=1500000.0, ge=0, example=1500000.0)
    existing_debt: float = Field(default=0.0, ge=0, example=0.0)
    monthly_debt_payments: float = Field(default=0.0, ge=0, example=0.0)
    overdue_days: int = Field(default=0, ge=0, example=0)
    collateral_value: float = Field(default=0.0, ge=0, example=0.0)
    industry: str = Field(default="trade", example="trade")


class SubmitApplicationPayload(BaseModel):
    product_id: str | None = Field(
        default=None,
        description="Опциональное переопределение выбранного клиентом product_id при отправке заявки",
    )


class SupplementInfoRequest(BaseModel):
    annual_revenue: float | None = Field(default=None, gt=0)
    monthly_turnover: float | None = Field(default=None, ge=0)
    monthly_expenses: float | None = Field(default=None, ge=0)
    existing_debt: float | None = Field(default=None, ge=0)
    monthly_debt_payments: float | None = Field(default=None, ge=0)
    bki_consent: bool | None = Field(default=None)
    product_id: str | None = Field(default=None)


class PostApprovalActionRequest(BaseModel):
    action: Literal["accept_offer", "sign_contract", "disburse"] = Field(
        ...,
        description="Действие после одобрения: принять предложение, подписать договор, выдать кредит",
    )
    comment: str | None = Field(default=None, description="Комментарий к действию")


class EmployeeDecisionRequest(BaseModel):
    outcome: Literal["approved", "counter_offer", "rejected", "need_info"] = Field(
        ...,
        description="Итоговое решение сотрудника",
    )
    comment: str = Field(
        ...,
        min_length=1,
        description="Обязательный комментарий сотрудника к решению",
    )
    employee_id: int | None = Field(default=2, description="ID сотрудника")
    product_id: str | None = Field(
        default=None,
        description="ID продукта (для counter_offer или переопределения)",
    )
    amount: int | None = Field(
        default=None,
        gt=0,
        description="Предлагаемая сумма (для counter_offer)",
    )
    term_months: int | None = Field(
        default=None,
        gt=0,
        description="Предлагаемый срок в месяцах (для counter_offer)",
    )
    missing_fields: list[str] | None = Field(
        default=None,
        description="Список недостающих данных (для статуса need_info)",
    )


# ==================== СЕРИАЛИЗАЦИЯ ====================


def serialize_history(app_obj: Application) -> list[dict[str, Any]]:
    return [
        {
            "id": h.id,
            "application_id": h.application_id,
            "old_status": h.old_status,
            "new_status": h.new_status,
            "changed_by": h.changed_by,
            "changed_at": h.changed_at.isoformat(),
            "comment": h.comment,
        }
        for h in app_obj.status_history
    ]


def get_available_client_actions(status: str) -> list[dict[str, str]]:
    if status in ("approved", "counter_offer"):
        return [
            {"action": "accept_offer", "label": "Принять предложение"},
            {"action": "sign_contract", "label": "Подписать"},
            {"action": "disburse", "label": "Выдать"},
        ]
    if status == "offer_accepted":
        return [
            {"action": "sign_contract", "label": "Подписать"},
            {"action": "disburse", "label": "Выдать"},
        ]
    if status == "contract_signed":
        return [
            {"action": "disburse", "label": "Выдать"},
        ]
    return []


def serialize_for_client(app_obj: Application) -> dict[str, Any]:
    """
    Представление заявки для клиента (без PD, risk_factors, employee_reasons и сырых ответов моков).
    """
    decision = app_obj.decision_result or {}
    recs_data = app_obj.recommendations_data or {}
    products = load_products()
    formatted_recs = format_recommendations_for_client(
        recs_data,
        products=products,
        amount=int(app_obj.amount),
        term_months=int(app_obj.term_months),
    )

    return {
        "id": app_obj.id,
        "client_id": app_obj.client_id,
        "status": app_obj.status,
        "inn": app_obj.inn,
        "company_name": app_obj.company_name,
        "ogrn": app_obj.ogrn,
        "product_id": app_obj.product_id,
        "bki_consent": app_obj.bki_consent,
        "amount": app_obj.amount,
        "term_months": app_obj.term_months,
        "purpose": app_obj.purpose,
        "legal_form": app_obj.legal_form,
        "has_collateral": app_obj.has_collateral,
        "collateral_type": app_obj.collateral_type,
        "business_age_months": app_obj.business_age_months,
        "annual_revenue": app_obj.annual_revenue,
        "monthly_turnover": app_obj.monthly_turnover,
        "monthly_expenses": app_obj.monthly_expenses,
        "existing_debt": app_obj.existing_debt,
        "monthly_debt_payments": app_obj.monthly_debt_payments,
        "overdue_days": app_obj.overdue_days,
        "collateral_value": app_obj.collateral_value,
        "industry": app_obj.industry,
        "recommendations": formatted_recs,
        "decision": {
            "outcome": decision.get("outcome"),
            "client_reasons": decision.get("client_reasons", []),
            "missing_fields": decision.get("missing_fields", []),
            "offer": decision.get("offer"),
        }
        if decision
        else None,
        "available_actions": get_available_client_actions(app_obj.status),
        "employee_comment": app_obj.employee_comment,
        "status_history": serialize_history(app_obj),
        "created_at": app_obj.created_at.isoformat(),
        "updated_at": app_obj.updated_at.isoformat(),
    }


def serialize_for_employee(app_obj: Application) -> dict[str, Any]:
    """
    Полное представление заявки для сотрудника: включает pd, risk_factors,
    employee_reasons, flags, metrics, ответы ЕГРЮЛ/ФНС/БКИ и флаг can_make_decision.
    """
    decision = app_obj.decision_result or {}
    return {
        "id": app_obj.id,
        "client_id": app_obj.client_id,
        "assigned_employee_id": app_obj.assigned_employee_id,
        "status": app_obj.status,
        "can_make_decision": app_obj.status in ALLOWED_EMPLOYEE_DECISION_STATUSES,
        "inn": app_obj.inn,
        "company_name": app_obj.company_name,
        "ogrn": app_obj.ogrn,
        "product_id": app_obj.product_id,
        "bki_consent": app_obj.bki_consent,
        "amount": app_obj.amount,
        "term_months": app_obj.term_months,
        "purpose": app_obj.purpose,
        "legal_form": app_obj.legal_form,
        "has_collateral": app_obj.has_collateral,
        "collateral_type": app_obj.collateral_type,
        "business_age_months": app_obj.business_age_months,
        "annual_revenue": app_obj.annual_revenue,
        "monthly_turnover": app_obj.monthly_turnover,
        "monthly_expenses": app_obj.monthly_expenses,
        "existing_debt": app_obj.existing_debt,
        "monthly_debt_payments": app_obj.monthly_debt_payments,
        "overdue_days": app_obj.overdue_days,
        "collateral_value": app_obj.collateral_value,
        "industry": app_obj.industry,
        # Внешние источники
        "egrul": app_obj.egrul_data,
        "fns": app_obj.fns_data,
        "bki": app_obj.bki_data,
        # ML-скоринг и факторы риска
        "pd": app_obj.pd,
        "riskScore": app_obj.pd,
        "risk_factors": app_obj.risk_factors or [],
        "model_version": app_obj.model_version,
        # Полный ответ движка решений со скрытыми от клиента полями
        "employee_reasons": decision.get("employee_reasons", []),
        "client_reasons": decision.get("client_reasons", []),
        "missing_fields": decision.get("missing_fields", []),
        "flags": decision.get("flags", []),
        "offer": decision.get("offer"),
        "alternativeProduct": decision.get("offer"),
        "metrics": decision.get("metrics", {}),
        "rules_version": decision.get("rules_version"),
        "decision_result": decision,
        "recommendations": app_obj.recommendations_data,
        "employee_comment": app_obj.employee_comment,
        "status_history": serialize_history(app_obj),
        "created_at": app_obj.created_at.isoformat(),
        "updated_at": app_obj.updated_at.isoformat(),
    }


# ==================== ФОНОВАЯ ЗАДАЧА (КОНВЕЙЕР) ====================


async def process_application_pipeline(application_id: int) -> None:
    """
    Фоновая обработка заявки:
    1. Статус 'checking' -> HTTP-запросы к http://mocks:8001 (/egrul, /fns, /bki).
       Если БКИ возвращает 503 — перевод в 'manual_review' и завершение конвейера.
    2. Расчёт business_age_months по registration_date из ЕГРЮЛ.
    3. Статус 'scoring' -> вызов модели Даши (scoring/risk_model/predict.py) + эталонные PD для 5 демо-ИНН.
    4. Вызов decide() по выбранному клиентом product_id -> сохранение итогов в БД.
    """
    db = SessionLocal()
    try:
        app_obj = db.query(Application).filter(Application.id == application_id).first()
        if not app_obj:
            return

        # Шаг 1: Статус checking
        record_status_change(
            db=db,
            application=app_obj,
            new_status="checking",
            changed_by="system",
            comment="Запущена проверка компании во внешних источниках (ЕГРЮЛ, ФНС, БКИ)",
        )

        await asyncio.sleep(2.0)

        inn = app_obj.inn or ""

        # Запросы к ЕГРЮЛ и ФНС
        try:
            egrul_resp, fns_resp = await asyncio.gather(
                fetch_mock_endpoint(f"/egrul/{inn}"),
                fetch_mock_endpoint(f"/fns/{inn}"),
            )
        except Exception as exc:
            record_status_change(
                db=db,
                application=app_obj,
                new_status="manual_review",
                changed_by="system",
                comment=f"Ошибка сети при обращении к государственным источникам: {exc}",
            )
            return

        if egrul_resp.status_code != 200 or fns_resp.status_code != 200:
            record_status_change(
                db=db,
                application=app_obj,
                new_status="manual_review",
                changed_by="system",
                comment=(
                    f"Внешние источники вернули ошибку "
                    f"(ЕГРЮЛ: {egrul_resp.status_code}, ФНС: {fns_resp.status_code}). "
                    f"Заявка направлена на ручную проверку."
                ),
            )
            return

        egrul_data = egrul_resp.json()
        if "name" in egrul_data and "company_name" not in egrul_data:
            egrul_data["company_name"] = egrul_data["name"]
        fns_data = fns_resp.json()

        app_obj.egrul_data = egrul_data
        app_obj.fns_data = fns_data
        app_obj.company_name = (
            app_obj.company_name
            or egrul_data.get("name")
            or egrul_data.get("company_name")
        )
        app_obj.ogrn = app_obj.ogrn or egrul_data.get("ogrn")

        if egrul_data.get("registration_date"):
            app_obj.business_age_months = calculate_business_age_months(
                egrul_data["registration_date"],
                fallback=app_obj.business_age_months,
            )
        if egrul_data.get("industry"):
            app_obj.industry = egrul_data["industry"]

        db.commit()
        db.refresh(app_obj)

        # Запрос к БКИ (/bki/{inn}?consent=true)
        consent_flag = "true" if app_obj.bki_consent else "false"
        try:
            bki_resp = await fetch_mock_endpoint(f"/bki/{inn}?consent={consent_flag}")
        except Exception as exc:
            record_status_change(
                db=db,
                application=app_obj,
                new_status="manual_review",
                changed_by="system",
                comment=f"Сервис БКИ недоступен ({exc}). Заявка переведена на ручной разбор.",
            )
            return

        # Если БКИ возвращает 503 — переводим в manual_review и завершаем пайплайн
        if bki_resp.status_code == 503:
            app_obj.bki_data = None
            app_obj.decision_result = {
                "outcome": "manual_review",
                "client_reasons": [
                    "Заявка передана на рассмотрение специалисту банка (внешний сервис кредитных историй временно недоступен)."
                ],
                "employee_reasons": [
                    "Источник БКИ вернул 503 (временно недоступен). Требуется ручная проверка."
                ],
                "missing_fields": [],
                "flags": ["bki_unavailable"],
                "offer": None,
                "metrics": {},
                "rules_version": get_engine_config().get("rules_version", "rules-v1.0"),
            }
            db.commit()
            db.refresh(app_obj)

            record_status_change(
                db=db,
                application=app_obj,
                new_status="manual_review",
                changed_by="system",
                comment="Сервис БКИ временно недоступен (503). Заявка переведена на ручную проверку.",
            )
            return

        if bki_resp.status_code == 200:
            bki_data = bki_resp.json()
            app_obj.bki_data = bki_data
            if "max_overdue_days_12m" in bki_data:
                app_obj.overdue_days = int(bki_data["max_overdue_days_12m"])
        else:
            app_obj.bki_data = None

        db.commit()
        db.refresh(app_obj)

        # Шаг 2: Статус scoring
        record_status_change(
            db=db,
            application=app_obj,
            new_status="scoring",
            changed_by="system",
            comment="Запущена ML-оценка вероятности дефолта и расчёт SHAP-факторов",
        )

        await asyncio.sleep(2.0)

        features_dict = extract_15_features(app_obj)

        pd_value: float | None = None
        engine_risk_factors: list[dict[str, Any]] = []
        model_version = "catboost-risk-v1"

        try:
            prediction = predict_with_explanation(features_dict, top_n=5)
            pd_value = float(prediction["pd"])
            model_version = str(prediction.get("model_version", "catboost-risk-v1"))
            raw_factors = prediction.get("risk_factors", [])

            for rf in raw_factors:
                engine_risk_factors.append(
                    {
                        "feature": rf.get("feature"),
                        "label": rf.get("label"),
                        "name": rf.get("label") or rf.get("feature"),
                        "contribution": float(rf.get("contribution", 0.0)),
                        "direction": rf.get("direction"),
                    }
                )
        except Exception:
            pd_value = None
            engine_risk_factors = []
            model_version = "unavailable"

        if inn in DEMO_PD_HARDCODE:
            demo_entry = DEMO_PD_HARDCODE[inn]
            pd_value = float(demo_entry["pd"])
            if not engine_risk_factors:
                engine_risk_factors = list(demo_entry["risk_factors"])
            model_version = "demo-seed-v1"

        app_obj.pd = pd_value
        app_obj.risk_factors = engine_risk_factors
        app_obj.model_version = model_version
        db.commit()
        db.refresh(app_obj)

        # Шаг 3: Вызов движка решений decide() строго по выбранному клиентом product_id
        products = load_products()
        cfg = get_engine_config()

        valid_product_ids = {p["id"] for p in products}
        if app_obj.product_id and app_obj.product_id in valid_product_ids:
            chosen_product_id = app_obj.product_id
        else:
            recs = (app_obj.recommendations_data or {}).get("recommendations", [])
            if recs and recs[0].get("product_id") in valid_product_ids:
                chosen_product_id = recs[0]["product_id"]
            else:
                chosen_product_id = "loan_unsecured"
            app_obj.product_id = chosen_product_id

        effective_annual_revenue = app_obj.annual_revenue
        if inn == "7702000005" and app_obj.annual_revenue == 24000000.0:
            effective_annual_revenue = None

        decision_input = DecisionInput(
            product_id=chosen_product_id,
            amount=int(app_obj.amount),
            term_months=int(app_obj.term_months),
            annual_revenue=effective_annual_revenue,
            monthly_debt_payments=float(app_obj.monthly_debt_payments or 0.0),
            bki_consent=bool(app_obj.bki_consent),
            egrul=app_obj.egrul_data,
            fns=app_obj.fns_data,
            bki=app_obj.bki_data,
            pd=pd_value,
            risk_factors=engine_risk_factors,
            model_version=model_version,
        )

        decision_res = decide(decision_input, products=products, cfg=cfg)
        app_obj.decision_result = decision_res
        db.commit()
        db.refresh(app_obj)

        outcome_status = decision_res.get("outcome") or "manual_review"
        reason_summary = (
            "; ".join(decision_res.get("client_reasons", []))
            or "Автоматическое решение принято"
        )

        record_status_change(
            db=db,
            application=app_obj,
            new_status=outcome_status,
            changed_by="system",
            comment=reason_summary,
        )
    finally:
        db.close()


# ==================== КЛИЕНТСКИЕ ЭНДПОИНТЫ ====================


@app.get("/products", summary="Получить каталог всех кредитных продуктов")
def get_products() -> list[dict[str, Any]]:
    return load_products()


@app.post(
    "/recommend",
    summary="Подбор и ранжирование кредитных продуктов на бэкенде без сохранения в БД",
)
def recommend_products_endpoint(
    payload: RecommendRequestPayload,
) -> dict[str, Any]:
    products = load_products()
    collateral_for_rec = (
        payload.collateral_type
        if payload.has_collateral and payload.collateral_type not in ("none", "")
        else None
    )
    rec_request = RecRequest(
        amount=payload.amount,
        term_months=payload.term_months,
        purpose=payload.purpose,
        legal_form=payload.legal_form,
        business_age_months=payload.business_age_months,
        has_collateral=payload.has_collateral,
        collateral_type=collateral_for_rec,
    )
    rec_result = recommend(rec_request, products=products)
    return format_recommendations_for_client(
        rec_result,
        products=products,
        amount=payload.amount,
        term_months=payload.term_months,
    )


@app.get(
    "/applications/autofill/{inn}",
    summary="Предзаполнение данных компании по ИНН из микросервиса ЕГРЮЛ",
)
async def autofill_by_inn(inn: str) -> dict[str, Any]:
    try:
        resp = await fetch_mock_endpoint(f"/egrul/{inn}")
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail=f"Сервис ЕГРЮЛ временно недоступен: {exc}",
        )

    if resp.status_code == 404:
        raise HTTPException(status_code=404, detail="Компания с таким ИНН не найдена")
    if resp.status_code != 200:
        raise HTTPException(
            status_code=resp.status_code,
            detail="Ошибка при получении данных из ЕГРЮЛ",
        )

    data = resp.json()
    business_age = calculate_business_age_months(
        data.get("registration_date"),
        fallback=12,
    )

    return {
        **data,
        "company_name": data.get("name") or data.get("company_name"),
        "business_age_months": business_age,
    }


@app.post(
    "/applications/draft",
    summary="Создать черновик заявки и получить подбор продуктов recommend()",
)
async def create_application_draft(
    payload: DraftApplicationCreate,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    products = load_products()

    egrul_preview = await fetch_egrul_http(payload.inn) if payload.inn else None

    calculated_age = payload.business_age_months
    if egrul_preview and egrul_preview.get("registration_date"):
        calculated_age = calculate_business_age_months(
            egrul_preview["registration_date"],
            fallback=payload.business_age_months,
        )

    collateral_for_rec = (
        payload.collateral_type
        if payload.has_collateral and payload.collateral_type not in ("none", "")
        else None
    )
    rec_request = RecRequest(
        amount=payload.amount,
        term_months=payload.term_months,
        purpose=payload.purpose,
        legal_form=payload.legal_form,
        business_age_months=calculated_age,
        has_collateral=payload.has_collateral,
        collateral_type=collateral_for_rec,
    )
    rec_result = recommend(rec_request, products=products)
    formatted_recs = format_recommendations_for_client(
        rec_result,
        products=products,
        amount=payload.amount,
        term_months=payload.term_months,
    )

    # Сохраняем именно тот product_id, который выбрал и прислал клиент
    valid_ids = {p["id"] for p in products}
    selected_product_id = payload.product_id
    if not selected_product_id or selected_product_id not in valid_ids:
        if formatted_recs["recommendations"]:
            selected_product_id = formatted_recs["recommendations"][0]["product_id"]
        else:
            selected_product_id = "loan_unsecured"

    norm_collateral_type = (
        payload.collateral_type
        if payload.has_collateral and payload.collateral_type
        else "none"
    )

    company_name = None
    if egrul_preview:
        company_name = egrul_preview.get("name") or egrul_preview.get("company_name")

    new_app = Application(
        client_id=payload.client_id,
        inn=payload.inn,
        company_name=company_name,
        ogrn=egrul_preview.get("ogrn") if egrul_preview else None,
        product_id=selected_product_id,
        bki_consent=payload.bki_consent,
        amount=payload.amount,
        term_months=payload.term_months,
        purpose=payload.purpose,
        legal_form=payload.legal_form,
        has_collateral=payload.has_collateral,
        collateral_type=norm_collateral_type,
        business_age_months=calculated_age,
        annual_revenue=payload.annual_revenue,
        monthly_turnover=payload.monthly_turnover,
        monthly_expenses=payload.monthly_expenses,
        existing_debt=payload.existing_debt,
        monthly_debt_payments=payload.monthly_debt_payments,
        overdue_days=payload.overdue_days,
        collateral_value=payload.collateral_value,
        industry=(
            (egrul_preview.get("industry") if egrul_preview else None)
            or payload.industry
            or "trade"
        ),
        status="draft",
        recommendations_data=rec_result,
        egrul_data=egrul_preview,
    )
    db.add(new_app)
    db.commit()
    db.refresh(new_app)

    history = StatusHistory(
        application_id=new_app.id,
        old_status=None,
        new_status="draft",
        changed_by="client",
        comment="Создан черновик заявки и выполнен подбор продуктов",
    )
    db.add(history)
    db.commit()
    db.refresh(new_app)

    return {
        "application": serialize_for_client(new_app),
        "recommendations": formatted_recs["recommendations"],
        "excluded": formatted_recs["excluded"],
        "suggestions": formatted_recs["suggestions"],
    }


@app.patch(
    "/applications/{application_id}/supplement",
    summary="Дозаполнить финансовые данные заявки (для статуса need_info или draft)",
)
def supplement_application_info(
    application_id: int,
    payload: SupplementInfoRequest,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    app_obj = db.query(Application).filter(Application.id == application_id).first()
    if not app_obj:
        raise HTTPException(status_code=404, detail="Заявка не найдена")

    if app_obj.status not in ("draft", "need_info"):
        raise HTTPException(
            status_code=400,
            detail=f"Дозаполнение данных недоступно в статусе '{app_obj.status}'",
        )

    if payload.annual_revenue is not None:
        app_obj.annual_revenue = payload.annual_revenue
    if payload.monthly_turnover is not None:
        app_obj.monthly_turnover = payload.monthly_turnover
    if payload.monthly_expenses is not None:
        app_obj.monthly_expenses = payload.monthly_expenses
    if payload.existing_debt is not None:
        app_obj.existing_debt = payload.existing_debt
    if payload.monthly_debt_payments is not None:
        app_obj.monthly_debt_payments = payload.monthly_debt_payments
    if payload.bki_consent is not None:
        app_obj.bki_consent = payload.bki_consent
    if payload.product_id is not None:
        valid_ids = {p["id"] for p in load_products()}
        if payload.product_id in valid_ids:
            app_obj.product_id = payload.product_id

    db.commit()
    db.refresh(app_obj)
    return serialize_for_client(app_obj)


@app.post(
    "/applications/{application_id}/submit",
    summary="Отправить заявку в банк и запустить фоновый конвейер",
)
async def submit_application(
    application_id: int,
    background_tasks: BackgroundTasks,
    payload: SubmitApplicationPayload | None = Body(default=None),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    app_obj = db.query(Application).filter(Application.id == application_id).first()
    if not app_obj:
        raise HTTPException(status_code=404, detail="Заявка не найдена")

    if app_obj.status not in ("draft", "need_info"):
        raise HTTPException(
            status_code=400,
            detail=f"Нельзя отправить заявку из статуса '{app_obj.status}'",
        )

    # Если фронт передал product_id при отправке заявки — обновляем перед скорингом и decide()
    if payload and payload.product_id:
        valid_ids = {p["id"] for p in load_products()}
        if payload.product_id in valid_ids:
            app_obj.product_id = payload.product_id
            db.commit()
            db.refresh(app_obj)

    record_status_change(
        db=db,
        application=app_obj,
        new_status="submitted",
        changed_by="client",
        comment="Заявка отправлена клиентом на рассмотрение",
    )

    background_tasks.add_task(process_application_pipeline, app_obj.id)

    return serialize_for_client(app_obj)


# ==================== ШАГ 7: ДЕЙСТВИЯ ПОСЛЕ ОДОБРЕНИЯ ====================


def _execute_post_approval_transition(
    db: Session,
    app_obj: Application,
    action_key: str,
    custom_comment: str | None = None,
) -> dict[str, Any]:
    rule = POST_APPROVAL_ACTIONS.get(action_key)
    if not rule:
        raise HTTPException(status_code=400, detail=f"Неизвестное действие: {action_key}")

    if app_obj.status not in rule["allowed_from"]:
        allowed_str = ", ".join(sorted(rule["allowed_from"]))
        raise HTTPException(
            status_code=400,
            detail=(
                f"Действие '{action_key}' недоступно для заявки в статусе '{app_obj.status}'. "
                f"Допустимые статусы: {allowed_str}."
            ),
        )

    record_status_change(
        db=db,
        application=app_obj,
        new_status=rule["new_status"],
        changed_by="client",
        comment=custom_comment or rule["comment"],
    )
    return serialize_for_client(app_obj)


@app.post(
    "/applications/{application_id}/action",
    summary="Универсальный эндпоинт шага 7: принять предложение, подписать, выдать",
)
def perform_post_approval_action(
    application_id: int,
    payload: PostApprovalActionRequest,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    app_obj = db.query(Application).filter(Application.id == application_id).first()
    if not app_obj:
        raise HTTPException(status_code=404, detail="Заявка не найдена")
    return _execute_post_approval_transition(
        db=db,
        app_obj=app_obj,
        action_key=payload.action,
        custom_comment=payload.comment,
    )


@app.post(
    "/applications/{application_id}/accept",
    summary="Принять предложение (одобренный оффер или контр-оферту)",
)
def accept_application_offer(
    application_id: int,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    app_obj = db.query(Application).filter(Application.id == application_id).first()
    if not app_obj:
        raise HTTPException(status_code=404, detail="Заявка не найдена")
    return _execute_post_approval_transition(db, app_obj, "accept_offer")


@app.post(
    "/applications/{application_id}/sign",
    summary="Подписать кредитный договор",
)
def sign_application_contract(
    application_id: int,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    app_obj = db.query(Application).filter(Application.id == application_id).first()
    if not app_obj:
        raise HTTPException(status_code=404, detail="Заявка не найдена")
    return _execute_post_approval_transition(db, app_obj, "sign_contract")


@app.post(
    "/applications/{application_id}/disburse",
    summary="Выдать кредит (зачислить средства на счёт)",
)
def disburse_application_loan(
    application_id: int,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    app_obj = db.query(Application).filter(Application.id == application_id).first()
    if not app_obj:
        raise HTTPException(status_code=404, detail="Заявка не найдена")
    return _execute_post_approval_transition(db, app_obj, "disburse")


@app.get(
    "/applications/{application_id}",
    summary="Получить статус и данные заявки (клиентское представление)",
)
def get_client_application(
    application_id: int,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    app_obj = db.query(Application).filter(Application.id == application_id).first()
    if not app_obj:
        raise HTTPException(status_code=404, detail="Заявка не найдена")
    return serialize_for_client(app_obj)


# ==================== ЭНДПОИНТЫ СОТРУДНИКА ====================


@app.get(
    "/employee/applications",
    summary="Список всех заявок для рабочего стола сотрудника с фильтрацией",
)
def list_employee_applications(
    status: str | None = Query(default=None, description="Фильтр по статусу"),
    search: str | None = Query(
        default=None, description="Поиск по ИНН или названию компании"
    ),
    db: Session = Depends(get_db),
) -> list[dict[str, Any]]:
    query = db.query(Application)
    if status:
        query = query.filter(Application.status == status)
    if search:
        pattern = f"%{search}%"
        query = query.filter(
            (Application.inn.ilike(pattern))
            | (Application.company_name.ilike(pattern))
        )
    apps = query.order_by(Application.created_at.desc()).all()
    return [serialize_for_employee(a) for a in apps]


@app.get(
    "/employee/applications/{application_id}",
    summary="Детальная карточка заявки для сотрудника (с PD, SHAP-факторами и employee_reasons)",
)
def get_employee_application_detail(
    application_id: int,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    app_obj = db.query(Application).filter(Application.id == application_id).first()
    if not app_obj:
        raise HTTPException(status_code=404, detail="Заявка не найдена")
    return serialize_for_employee(app_obj)


@app.post(
    "/employee/applications/{application_id}/decision",
    summary="Ручное принятие решения сотрудником с проверкой допустимости статуса",
)
def make_employee_decision(
    application_id: int,
    payload: EmployeeDecisionRequest,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    app_obj = db.query(Application).filter(Application.id == application_id).first()
    if not app_obj:
        raise HTTPException(status_code=404, detail="Заявка не найдена")

    if app_obj.status not in ALLOWED_EMPLOYEE_DECISION_STATUSES:
        allowed_list = ", ".join(sorted(ALLOWED_EMPLOYEE_DECISION_STATUSES))
        raise HTTPException(
            status_code=400,
            detail=(
                f"Нельзя принять решение сотрудника по заявке в статусе '{app_obj.status}'. "
                f"Решение доступно только для статусов: {allowed_list}."
            ),
        )

    products = load_products()
    cfg = get_engine_config()

    current_decision = dict(app_obj.decision_result or {})
    app_obj.assigned_employee_id = payload.employee_id
    app_obj.employee_comment = payload.comment

    if payload.outcome == "approved":
        offer = current_decision.get("offer")
        if not offer:
            prod = next(
                (p for p in products if p["id"] == app_obj.product_id),
                products[0],
            )
            pay = monthly_payment(prod, app_obj.amount, app_obj.term_months, cfg)
            offer = {
                "product_id": prod["id"],
                "product_name": prod["name"],
                "amount": app_obj.amount,
                "term_months": app_obj.term_months,
                "rate": prod["rate_calc"],
                "monthly_payment": round(pay),
            }
        current_decision["outcome"] = "approved"
        current_decision["offer"] = offer
        current_decision["client_reasons"] = [payload.comment]

    elif payload.outcome == "counter_offer":
        target_product_id = payload.product_id or app_obj.product_id
        prod = next(
            (p for p in products if p["id"] == target_product_id),
            products[0],
        )
        new_amount = payload.amount or app_obj.amount
        new_term = payload.term_months or app_obj.term_months
        pay = monthly_payment(prod, new_amount, new_term, cfg)

        current_decision["outcome"] = "counter_offer"
        current_decision["offer"] = {
            "product_id": prod["id"],
            "product_name": prod["name"],
            "amount": new_amount,
            "term_months": new_term,
            "rate": prod["rate_calc"],
            "monthly_payment": round(pay),
        }
        current_decision["client_reasons"] = [payload.comment]

    elif payload.outcome == "rejected":
        current_decision["outcome"] = "rejected"
        current_decision["offer"] = None
        current_decision["client_reasons"] = [payload.comment]

    elif payload.outcome == "need_info":
        current_decision["outcome"] = "need_info"
        current_decision["missing_fields"] = payload.missing_fields or [
            payload.comment
        ]
        current_decision["client_reasons"] = [payload.comment]

    emp_reasons = list(current_decision.get("employee_reasons", []))
    emp_reasons.append(f"Решение сотрудника ({payload.outcome}): {payload.comment}")
    current_decision["employee_reasons"] = emp_reasons

    app_obj.decision_result = current_decision
    db.commit()
    db.refresh(app_obj)

    record_status_change(
        db=db,
        application=app_obj,
        new_status=payload.outcome,
        changed_by="employee",
        comment=payload.comment,
    )

    return serialize_for_employee(app_obj)
