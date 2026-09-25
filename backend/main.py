from typing import Any, Optional

from authorization import authorize_transaction
from algorand import send_algorand_payment
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from trust_engine import calculate_trust_score, make_decision
from database import (
    initialize_database,
    save_transaction,
    get_transactions,
    get_providers as get_db_providers
)
from network import get_network_config
from x402_payment import (
    complete_browser_payment,
    payment_status,
    prepare_browser_payment,
    skipped_payment
)

app = FastAPI(
    title="AgentShield API",
    description="Trust infrastructure for autonomous AI commerce",
    version="0.6.0"
)

initialize_database()
get_network_config()

# Allow the frontend to communicate with the backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


class AnalyzeRequest(BaseModel):
    reputation: float
    successful_transactions: int
    verified: bool
    price: float
    payer: Optional[str] = None
    payment_group: Optional[list[str]] = None
    accepted: Optional[dict[str, Any]] = None
    payment_index: int = 1
    resource: Optional[dict[str, Any]] = None


class PreparePaymentRequest(BaseModel):
    payer: str


class AuthorizeRequest(BaseModel):
    service: str
    reputation: float
    successful_transactions: int
    verified: bool
    price: float
    amount: float
    payment: Optional[dict[str, Any]] = None


DEMO_PROVIDERS = [
    {
        "id": "weather-pro",
        "name": "Weather Intelligence API",
        "description": "Reliable real-time weather intelligence",
        "reputation": 98,
        "successful_transactions": 127,
        "verified": True,
        "price": 0.001,
        "payment_protocol": "x402"
    },
    {
        "id": "fast-weather",
        "name": "FastWeather API",
        "description": "Fast weather data with moderate reputation",
        "reputation": 74,
        "successful_transactions": 70,
        "verified": True,
        "price": 0.005,
        "payment_protocol": "x402"
    },
    {
        "id": "unknown-weather",
        "name": "UnknownWeather API",
        "description": "Unverified weather service",
        "reputation": 25,
        "successful_transactions": 3,
        "verified": False,
        "price": 0.05,
        "payment_protocol": "x402"
    }
]


# -------------------------
# Basic & Status endpoints
# -------------------------

@app.get("/")
def root():
    return {
        "name": "AgentShield",
        "status": "online",
        "message": "Trust layer for autonomous commerce"
    }


@app.get("/health")
@app.get("/svc/api/health")
def health():
    return {
        "status": "healthy"
    }


@app.get("/providers")
def get_providers():
    db_providers = get_db_providers()
    if db_providers:
        return {"providers": db_providers}
    return {
        "providers": DEMO_PROVIDERS
    }


# -------------------------
# Blockchain & Pera Wallet Payment
# -------------------------

@app.get("/payment/status")
def get_payment_status():
    return payment_status()


@app.post("/payment/prepare")
async def prepare_payment(request: PreparePaymentRequest):
    """Build an unsigned x402 transaction group for Pera Wallet / browser wallet."""
    try:
        return await prepare_browser_payment(request.payer)
    except Exception as exc:
        return skipped_payment(str(exc), status="PREPARE_FAILED")


# -------------------------
# Trust Engine & Analysis
# -------------------------

@app.post("/analyze")
def analyze_service(request: AnalyzeRequest):
    """
    Evaluates provider trust score.
    If Pera Wallet signed transactions are provided, settles x402 payment first.
    """
    payment = None
    if request.payer and request.payment_group and request.accepted:
        import asyncio
        payment = asyncio.run(complete_browser_payment(
            payer=request.payer,
            payment_group=request.payment_group,
            accepted=request.accepted,
            payment_index=request.payment_index,
            resource=request.resource
        ))

        if not payment.get("success"):
            return {
                "service": "AgentShield Analysis",
                "analyzed": False,
                "payment_protocol": "x402",
                "payment": payment
            }

    result = calculate_trust_score(
        reputation=request.reputation,
        successful_transactions=request.successful_transactions,
        verified=request.verified,
        price=request.price
    )

    response = {
        "service": "AgentShield Analysis",
        "analyzed": True,
        "reputation": request.reputation,
        "successful_transactions": request.successful_transactions,
        "verified": request.verified,
        "price": request.price,
        "trust_score": result["trust_score"],
        "risk_level": result["risk_level"],
        "decision": result["decision"],
        "payment_protocol": "x402"
    }
    if payment:
        response["payment"] = payment

    return response


@app.post("/authorize")
def authorize(request: AuthorizeRequest):
    """
    Evaluates whether a transaction should be authorized and records
    audit ledger with optional blockchain settlement details.
    """
    # 1. Calculate provider trust
    result = calculate_trust_score(
        reputation=request.reputation,
        successful_transactions=request.successful_transactions,
        verified=request.verified,
        price=request.price
    )

    # 2. Apply transaction authorization policy
    decision = authorize_transaction(
        trust_score=result["trust_score"],
        amount=request.amount
    )

    # 3. Reuse analyze settlement
    payment = request.payment or skipped_payment(
        "Settlement was not requested for this call.",
        status="NOT_REQUESTED"
    )

    payment_status_value = "NOT_ATTEMPTED"
    if payment.get("success"):
        payment_status_value = "SETTLED"
    elif payment.get("status") in {"FAILED", "SETTLEMENT_FAILED"}:
        payment_status_value = "FAILED"
    elif payment.get("status") in {
        "WALLET_MISSING",
        "WALLET_INVALID",
        "NOT_CONFIGURED",
        "NOT_REQUESTED"
    }:
        payment_status_value = payment["status"]

    network = get_network_config()

    # 4. Save audit record
    transaction_id = save_transaction(
        service=request.service,
        trust_score=result["trust_score"],
        risk_level=decision["risk_level"],
        decision=decision["decision"],
        amount=request.amount,
        payment_protocol="x402",
        authorized=decision["authorized"],
        reason=decision["reason"],
        payment_status=payment_status_value,
        blockchain=network["label"] if payment.get("transaction_id") else None,
        blockchain_tx_id=payment.get("transaction_id")
    )

    # 5. Return decision and settlement to frontend
    return {
        "transaction_id": transaction_id,
        "service": request.service,
        "authorized": decision["authorized"],
        "decision": decision["decision"],
        "risk_level": decision["risk_level"],
        "trust_score": result["trust_score"],
        "amount": request.amount,
        "reason": decision["reason"],
        "payment_protocol": "x402",
        "payment": payment
    }


@app.get("/trust")
def get_trust():
    service = {
        "name": "Demo Weather API",
        "price": 0.001,
        "reputation": 98,
        "successful_transactions": 127,
        "verified": True
    }

    score = 0
    score += service["reputation"] * 0.4
    transaction_score = min(service["successful_transactions"] / 5, 20)
    score += transaction_score
    if service["verified"]:
        score += 20
    if service["price"] <= 0.001:
        score += 20
    score = round(score)

    if score >= 80:
        risk_level = "LOW"
        decision = "APPROVE"
    elif score >= 60:
        risk_level = "MEDIUM"
        decision = "REVIEW"
    else:
        risk_level = "HIGH"
        decision = "BLOCK"

    return {
        "service": service["name"],
        "trust_score": score,
        "risk_level": risk_level,
        "reputation": service["reputation"],
        "successful_transactions": service["successful_transactions"],
        "verified": service["verified"],
        "price": service["price"],
        "payment_protocol": "x402",
        "decision": decision
    }


@app.get("/transactions")
def transactions():
    return {
        "transactions": get_transactions()
    }


# -------------------------
# Native Algorand Settlement
# -------------------------

@app.post("/settle-algorand")
def settle_algorand(amount: float = 0.001):
    result = send_algorand_payment(
        amount_algo=amount
    )
    return result


if __name__ == "__main__":
    import os
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    uvicorn.run("backend.main:app", host="0.0.0.0", port=port, reload=False)
