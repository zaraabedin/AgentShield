"""
Algorand x402 payments signed by an injected browser wallet.

The backend prepares the unsigned atomic group and submits the
PAYMENT-SIGNATURE after the wallet signs. No private key is read
from .env for dashboard settlement.
"""

from typing import Any
from urllib.parse import urlparse

import certifi
import httpx
import os

from dotenv import load_dotenv

from network import explorer_url, get_network_config

os.environ.setdefault("SSL_CERT_FILE", certifi.where())
os.environ.setdefault("REQUESTS_CA_BUNDLE", certifi.where())
os.environ.setdefault("SSL_CERT_DIR", "")

load_dotenv()


class AddressOnlySigner:
    """Provides the buyer address. Signing happens in the browser."""

    def __init__(self, address: str):
        self._address = address

    @property
    def address(self) -> str:
        return self._address

    def sign_transactions(
        self,
        unsigned_txns: list[bytes],
        indexes_to_sign: list[int],
    ) -> list[bytes | None]:
        return [None] * len(unsigned_txns)


def payment_status() -> dict[str, Any]:
    config = get_network_config()
    return {
        "configured": True,
        "wallet_mode": "browser",
        "buyer_address": None,
        "facilitator": config["facilitator"],
        "paid_resource_url": config["paid_resource_url"],
        "network": config["label"],
        "network_id": config["name"],
        "pay_to": config["pay_to"],
        "genesis_id": config["genesis_id"],
        "genesis_hash": config["genesis_hash"],
        "asset": "USDC",
        "asset_id": config["usdc_asset"],
        "error": None
    }


def skipped_payment(message: str, status: str = "SKIPPED") -> dict[str, Any]:
    config = get_network_config()
    return {
        "success": False,
        "status": status,
        "message": message,
        "facilitator": config["facilitator"],
        "network": config["label"],
        "resource_url": config["paid_resource_url"],
        "transaction_id": None,
        "explorer_url": None,
        "payer": None,
        "resource": None
    }


def _parse_resource(response) -> Any:
    try:
        return response.json()
    except Exception:
        text = (response.text or "")[:2000]
        return text or None


def _settle_from_headers(headers) -> dict[str, Any] | None:
    from x402.http import x402HTTPClient
    from x402 import x402Client

    def get_header(name: str):
        return (
            headers.get(name)
            or headers.get(name.lower())
            or headers.get(name.upper())
        )

    http_client = x402HTTPClient(x402Client())
    try:
        settle = http_client.get_payment_settle_response(get_header)
        return settle.model_dump(by_alias=True)
    except ValueError:
        return None


def _pick_algorand_accept(accepts: list[dict[str, Any]]) -> dict[str, Any]:
    config = get_network_config()
    for entry in accepts:
        if entry.get("network") == config["caip2"]:
            return entry
    for entry in accepts:
        network = str(entry.get("network") or "")
        if network.startswith("algorand:"):
            return entry
    raise RuntimeError(
        "This paid resource does not accept Algorand x402."
    )


async def _discover_payment_required() -> tuple[Any, dict[str, Any]]:
    from x402.http import x402HTTPClient
    from x402 import x402Client
    from x402.schemas import PaymentRequired

    config = get_network_config()
    paid_url = config["paid_resource_url"]
    if not paid_url:
        raise RuntimeError("PAID_RESOURCE_URL is not set.")

    async with httpx.AsyncClient(timeout=20.0) as http:
        response = await http.get(paid_url)

    if response.status_code != 402:
        raise RuntimeError(
            f"Expected HTTP 402 from paid resource, got {response.status_code}."
        )

    def get_header(name: str):
        return (
            response.headers.get(name)
            or response.headers.get(name.lower())
            or response.headers.get(name.upper())
        )

    client = x402HTTPClient(x402Client())
    body = None
    try:
        body = response.json()
    except Exception:
        pass

    required = client.get_payment_required_response(get_header, body)
    data = required.model_dump(by_alias=True)
    accepts = data.get("accepts") or []
    accepted = _pick_algorand_accept(accepts)
    return PaymentRequired.model_validate(data), accepted


async def prepare_browser_payment(payer: str) -> dict[str, Any]:
    """Build an unsigned x402 group for the connected browser wallet."""

    from x402.mechanisms.avm.exact.client import ExactAvmScheme
    from x402.schemas import PaymentRequirements

    payer = (payer or "").strip()
    if len(payer) != 58:
        raise RuntimeError("Connect an Algorand wallet before paying.")

    config = get_network_config()
    required, accepted = await _discover_payment_required()

    scheme = ExactAvmScheme(
        AddressOnlySigner(payer),
        algod_url=config["algod_url"],
    )
    requirements = PaymentRequirements.model_validate(accepted)
    inner = scheme.create_payment_payload(requirements)
    payment_group = inner.get("paymentGroup") or inner.get("payment_group") or []
    payment_index = inner.get("paymentIndex", inner.get("payment_index", 1))

    return {
        "payer": payer,
        "network": config["label"],
        "network_id": config["name"],
        "genesis_id": config["genesis_id"],
        "genesis_hash": config["genesis_hash"],
        "facilitator": config["facilitator"],
        "resource_url": config["paid_resource_url"],
        "asset": "USDC",
        "asset_id": accepted.get("asset") or config["usdc_asset"],
        "amount": accepted.get("amount"),
        "pay_to": accepted.get("payTo") or accepted.get("pay_to"),
        "x402_version": 2,
        "accepted": accepted,
        "unsigned_txns": payment_group,
        "indexes_to_sign": [payment_index],
        "payment_index": payment_index,
        "resource": {
            "url": config["paid_resource_url"],
            "description": "AgentShield x402 analysis",
            "mimeType": "application/json"
        }
    }


async def complete_browser_payment(
    payer: str,
    payment_group: list[str],
    accepted: dict[str, Any],
    payment_index: int = 1,
    resource: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Submit the wallet-signed group and settle via the facilitator."""

    from x402.http.utils import encode_payment_signature_header
    from x402.http.constants import PAYMENT_SIGNATURE_HEADER
    from x402.schemas import PaymentPayload

    config = get_network_config()
    paid_url = config["paid_resource_url"]
    parsed = urlparse(paid_url)

    if not payment_group:
        return skipped_payment(
            "Wallet did not return a signed payment group.",
            status="WALLET_UNSIGNED"
        )

    payload = PaymentPayload.model_validate({
        "x402Version": 2,
        "payload": {
            "paymentGroup": payment_group,
            "paymentIndex": payment_index
        },
        "accepted": accepted,
        "resource": resource or {"url": paid_url}
    })

    header_value = encode_payment_signature_header(payload)

    try:
        async with httpx.AsyncClient(timeout=45.0) as http:
            response = await http.get(
                paid_url,
                headers={PAYMENT_SIGNATURE_HEADER: header_value}
            )
            await response.aread()
    except Exception as exc:
        return {
            **skipped_payment(
                f"x402 payment request failed: {exc}",
                status="FAILED"
            ),
            "payer": payer
        }

    settle = _settle_from_headers(response.headers)
    resource_body = _parse_resource(response)
    txid = None
    network = config["caip2"]
    settle_success = False

    if settle:
        txid = settle.get("transaction") or settle.get("transactionId")
        network = settle.get("network") or network
        settle_success = bool(settle.get("success")) and response.is_success
        if not settle_success:
            return {
                "success": False,
                "status": "SETTLEMENT_FAILED",
                "message": (
                    settle.get("errorMessage")
                    or settle.get("errorReason")
                    or f"Facilitator rejected settlement (HTTP {response.status_code})."
                ),
                "facilitator": config["facilitator"],
                "network": config["label"],
                "resource_url": paid_url,
                "transaction_id": txid,
                "explorer_url": explorer_url(txid, network),
                "payer": settle.get("payer") or payer,
                "resource": resource_body,
                "settle": settle
            }

    if response.is_success and (settle_success or txid):
        return {
            "success": True,
            "status": "SETTLED",
            "message": (
                f"x402 payment settled on {config['label']} "
                "by the GoPlausible facilitator."
            ),
            "facilitator": config["facilitator"],
            "network": config["label"],
            "resource_url": paid_url,
            "host": parsed.netloc,
            "transaction_id": txid,
            "explorer_url": explorer_url(txid, network),
            "payer": (settle or {}).get("payer") or payer,
            "resource": resource_body,
            "settle": settle
        }

    snippet = (response.text or "")[:400]
    extra = ""
    if response.status_code == 402:
        extra = (
            " Approve the wallet prompt, opt in to USDC ASA "
            f"{config['usdc_asset']}, and fund the account."
        )

    return {
        "success": False,
        "status": "FAILED",
        "message": (
            f"Paid resource returned HTTP {response.status_code}. "
            f"{snippet}{extra}"
        ).strip(),
        "facilitator": config["facilitator"],
        "network": config["label"],
        "resource_url": paid_url,
        "transaction_id": txid,
        "explorer_url": explorer_url(txid, network),
        "payer": payer,
        "resource": resource_body,
        "settle": settle
    }
