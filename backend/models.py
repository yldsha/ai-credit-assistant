from datetime import datetime
from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    JSON,
    String,
    Text,
    create_engine,
)
from sqlalchemy.orm import declarative_base, relationship, sessionmaker

DATABASE_URL = "sqlite:///./app.db"

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(100), unique=True, index=True, nullable=False)
    full_name = Column(String(200), nullable=False)
    role = Column(String(50), nullable=False, default="client")  # "client" | "employee"
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    applications = relationship(
        "Application",
        back_populates="client",
        foreign_keys="Application.client_id",
    )
    assigned_applications = relationship(
        "Application",
        back_populates="assigned_employee",
        foreign_keys="Application.assigned_employee_id",
    )


class Application(Base):
    __tablename__ = "applications"

    id = Column(Integer, primary_key=True, index=True)
    client_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    assigned_employee_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    # Данные компании и продукта (дефолт синхронизирован со сценарием 1 — ИП Петров Иван Сергеевич)
    inn = Column(String(20), index=True, nullable=True, default="770200000001")
    company_name = Column(String(255), nullable=True)
    ogrn = Column(String(20), nullable=True)
    product_id = Column(String(100), nullable=True, default="loan_unsecured")
    bki_consent = Column(Boolean, default=True, nullable=False)

    # === 15 обязательных признаков для predict.py ===
    amount = Column(Integer, nullable=False)
    term_months = Column(Integer, nullable=False)
    purpose = Column(String(50), nullable=False)
    legal_form = Column(String(20), nullable=False)
    has_collateral = Column(Boolean, default=False, nullable=False)
    collateral_type = Column(String(50), default="none", nullable=False)
    business_age_months = Column(Integer, nullable=False, default=12)
    annual_revenue = Column(Float, nullable=True, default=None)
    monthly_turnover = Column(Float, nullable=False, default=2000000.0)
    monthly_expenses = Column(Float, nullable=False, default=1500000.0)
    existing_debt = Column(Float, nullable=False, default=0.0)
    monthly_debt_payments = Column(Float, nullable=False, default=0.0)
    overdue_days = Column(Integer, nullable=False, default=0)
    collateral_value = Column(Float, nullable=False, default=0.0)
    industry = Column(String(100), nullable=False, default="trade")

    # Статус заявки
    status = Column(String(50), nullable=False, default="draft", index=True)

    # JSON-поля для сохранения рекомендаций, ответов внешних источников, скоринга и итогов decide()
    recommendations_data = Column(JSON, nullable=True)
    egrul_data = Column(JSON, nullable=True)
    fns_data = Column(JSON, nullable=True)
    bki_data = Column(JSON, nullable=True)

    pd = Column(Float, nullable=True)
    risk_factors = Column(JSON, nullable=True)
    model_version = Column(String(50), nullable=True)

    decision_result = Column(JSON, nullable=True)
    employee_comment = Column(Text, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
    )

    client = relationship(
        "User",
        back_populates="applications",
        foreign_keys=[client_id],
    )
    assigned_employee = relationship(
        "User",
        back_populates="assigned_applications",
        foreign_keys=[assigned_employee_id],
    )
    status_history = relationship(
        "StatusHistory",
        back_populates="application",
        cascade="all, delete-orphan",
        order_by="StatusHistory.changed_at.asc()",
    )


class StatusHistory(Base):
    __tablename__ = "status_history"

    id = Column(Integer, primary_key=True, index=True)
    application_id = Column(
        Integer,
        ForeignKey("applications.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    old_status = Column(String(50), nullable=True)
    new_status = Column(String(50), nullable=False)
    changed_by = Column(String(100), nullable=False)  # "client", "system", "employee"
    changed_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    comment = Column(Text, nullable=True)

    application = relationship("Application", back_populates="status_history")


def init_db() -> None:
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        if db.query(User).count() == 0:
            default_users = [
                User(
                    username="client_demo",
                    full_name="Петров Иван Сергеевич (ИП Петров Иван Сергеевич)",
                    role="client",
                ),
                User(
                    username="employee_demo",
                    full_name="Анна Кредитова (Андеррайтер МСБ)",
                    role="employee",
                ),
            ]
            db.add_all(default_users)
            db.commit()
        else:
            # Обновляем старое имя, если база уже была создана ранее
            client_user = (
                db.query(User).filter(User.username == "client_demo").first()
            )
            if client_user and "Ромашка" in (client_user.full_name or ""):
                client_user.full_name = (
                    "Петров Иван Сергеевич (ИП Петров Иван Сергеевич)"
                )
                db.commit()
    finally:
        db.close()