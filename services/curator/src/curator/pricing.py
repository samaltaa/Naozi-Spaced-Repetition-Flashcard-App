from __future__ import annotations

from decimal import Decimal

# Prices in USD per million tokens

MODEL_PRICES: dict[str, tuple[Decimal, Decimal]] = {
    "claude-opus-5-5": (Decimal(4), Decimal(20)),
    "claude-sonnet-5-5": (Decimal(2), Decimal(10)),
    "claude-sonnet-4-6": (Decimal(3), Decimal(15)),
    "claude-haiku-5-5": (Decimal("0.10"), Decimal("0.50")),
    "claude-haiku-4-5": (Decimal(1), Decimal(5)),
}

MILLION = Decimal(1_000_000)

# Cost

def cost_usd(model: str, input_tokens: int, output_tokens: int) -> Decimal | None:
    prices = MODEL_PRICES.get(model)
    if prices is None:
        return None
    input_price, output_price = prices
    total = (input_price * input_tokens + output_price * output_tokens) / MILLION
    return total.quantize(Decimal("0.000001"))
