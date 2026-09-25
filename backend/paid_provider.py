from dotenv import load_dotenv
from fastapi import FastAPI

from network import get_network_config
from x402.http import (
    FacilitatorConfig,
    HTTPFacilitatorClient,
    PaymentOption,
    RouteConfig,
)
from x402.http.middleware.fastapi import PaymentMiddlewareASGI
from x402.mechanisms.avm.exact import ExactAvmServerScheme
from x402.server import x402ResourceServer

load_dotenv()

app = FastAPI(title="AgentShield x402 Protected Provider")

config = get_network_config()
PAY_TO = config["pay_to"]

facilitator = HTTPFacilitatorClient(
    FacilitatorConfig(url=config["facilitator"])
)

server = x402ResourceServer(facilitator)
server.register(config["caip2"], ExactAvmServerScheme())

routes = {
    "GET /paid-weather": RouteConfig(
        accepts=[
            PaymentOption(
                scheme="exact",
                pay_to=PAY_TO,
                price="$0.001",
                network=config["caip2"],
            )
        ],
        mime_type="application/json",
        description="Premium weather intelligence",
    )
}

app.add_middleware(
    PaymentMiddlewareASGI,
    routes=routes,
    server=server,
)


@app.get("/")
async def root():
    return {
        "service": "Weather Intelligence API",
        "status": "online",
        "payment_protocol": "x402",
        "network": config["label"],
        "facilitator": config["facilitator"],
    }


@app.get("/paid-weather")
async def paid_weather():
    return {
        "service": "Weather Intelligence API",
        "data": {
            "temperature": "28°C",
            "condition": "Partly Cloudy",
            "humidity": "72%",
        },
        "message": (
            "Premium weather intelligence delivered after "
            f"x402 settlement on {config['label']}."
        ),
    }
