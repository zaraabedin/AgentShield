"""
AgentShield Algorand x402 helper.

Dashboard payments are signed by an injected browser wallet.
This CLI only prints facilitator / network status.
"""

import json
import sys

from dotenv import load_dotenv

from x402_payment import payment_status

load_dotenv()


def main():
    print("\n" + "=" * 62)
    print("        AGENTSHIELD — ALGORAND x402")
    print("=" * 62)

    status = payment_status()
    print(json.dumps(status, indent=2))
    print("\nSign payments in the dashboard with Pera, Defly, Lute, or Kibisis.")
    print("The API does not spend from a private key in .env.")

    if not status.get("paid_resource_url"):
        sys.exit(1)


if __name__ == "__main__":
    main()
