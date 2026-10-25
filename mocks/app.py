from __future__ import annotations

import asyncio
import json
import os
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query

DATA_PATH = Path(os.getenv("MOCK_DATA_PATH", Path(__file__).parent / "data" / "seed.json"))
LATENCY_MS = int(os.getenv("MOCK_LATENCY_MS", "300"))
FAIL_SOURCES = {s.strip() for s in os.getenv("MOCK_FAIL_SOURCES", "").split(",") if s.strip()}

app = FastAPI(
    title="Моки внешних источников",
    description="Имитация ЕГРЮЛ/ЕГРИП, ФНС «Прозрачный бизнес» и бюро кредитных историй. "
                "Отвечают по ИНН синтетическими данными.",
    version="1.0",
)


def _load() -> dict[str, dict]:
    with open(DATA_PATH, encoding="utf-8") as f:
        return {c["inn"]: c for c in json.load(f)["companies"]}


COMPANIES = _load()


async def _lookup(source: str, inn: str) -> dict:
    await asyncio.sleep(LATENCY_MS / 1000)
    company = COMPANIES.get(inn)
    if source in FAIL_SOURCES or (company and company.get("_simulate", {}).get(source) == "unavailable"):
        raise HTTPException(status_code=503, detail=f"Источник {source.upper()} временно недоступен")
    if company is None:
        raise HTTPException(status_code=404, detail="Компания с таким ИНН не найдена")
    return company


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "companies": len(COMPANIES)}


@app.get("/egrul/{inn}", summary="Выписка ЕГРЮЛ/ЕГРИП")
async def egrul(inn: str) -> dict:
    company = await _lookup("egrul", inn)
    return {"inn": inn, **company["egrul"]}


@app.get("/fns/{inn}", summary="ФНС «Прозрачный бизнес»")
async def fns(inn: str) -> dict:
    company = await _lookup("fns", inn)
    return {"inn": inn, **company["fns"]}


@app.get("/bki/{inn}", summary="Кредитный отчёт БКИ")
async def bki(inn: str, consent: bool = Query(False, description="Согласие клиента на запрос")) -> dict:
    if not consent:
        raise HTTPException(status_code=403, detail="Нет согласия клиента на запрос кредитной истории")
    company = await _lookup("bki", inn)
    return {"inn": inn, **company["bki"]}
