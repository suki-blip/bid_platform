# Pricing Modes

Vendors choose a pricing mode when submitting prices for a bid. Both modes produce a single final price that appears in the customer's comparison table.

## Combination Mode

The original pricing approach. The vendor sets a unique price for every possible combination of parameter options.

### How it works

Given parameters:
- Color: Red, Blue
- Size: S, M, L

The vendor sees a grid of all 6 combinations and enters a price for each:

| Color | Size | Price |
|---|---|---|
| Red | S | $100 |
| Red | M | $120 |
| Red | L | $150 |
| Blue | S | $110 |
| Blue | M | $130 |
| Blue | L | $160 |

### Scaling

Number of prices = product of all option counts.

| Parameters | Options each | Total prices |
|---|---|---|
| 2 | 3 | 9 |
| 3 | 4 | 64 |
| 5 | 5 | 3,125 |
| 10 | 3 | 59,049 |

Best for: bids with few parameters or where each combination truly has a unique price.

### Data format

Stored in `vendor_prices` table with `combination_key` as a JSON string with sorted keys:

```json
{"Color":"Red","Size":"Large"}
```

## Additive Mode

A linear pricing approach. The vendor sets a base price plus an addition for each individual option.

### How it works

Given the same parameters:
- Base price: $90
- Color: Red +$10, Blue +$20
- Size: S +$0, M +$20, L +$50

Final price = base + selected option additions.

Example: Red + M = $90 + $10 + $20 = **$120**

### Scaling

Number of prices = sum of all option counts + 1 (base price).

| Parameters | Options each | Total prices |
|---|---|---|
| 2 | 3 | 7 |
| 3 | 4 | 13 |
| 5 | 5 | 26 |
| 10 | 3 | 31 |

Best for: bids where each option independently adds cost, without complex interactions between parameters.

### Data format

- `vendor_responses.pricing_mode` = `"additive"`
- `vendor_responses.base_price` = the base price (e.g., 90)
- `vendor_prices` entries use keys like: `{"param":"Color","option":"Red"}` with price = the addition amount

## Conditional Discount Rules

An enhancement to additive mode. Vendors can define rules that apply discounts when specific options are selected.

### Rule structure

Each rule has three parts:

1. **Condition**: When `[parameter]` = `[option]`
2. **Target**: Apply to `[total price]` or `[specific parameter option]`
3. **Discount**: `[amount]` `[% off / $ off]`

### Examples

Given parameters: Material (Wood, Steel, Aluminum), Color (Red, Blue, White), Size (S, M, L, XL)

| Rule | Meaning |
|---|---|
| When Material = Wood, total gets 10% off | Wood is on sale, everything cheaper |
| When Color = Red, Size = XL gets $5 off | Red XL items have a special discount |
| When Size = S, Material = Steel gets 15% off | Small steel items are discounted |

### Calculation order

1. Start with base price
2. Add all selected option additions
3. For each rule, check if the condition matches the customer's current selection
4. If condition matches, apply the discount to the target (total or specific option's addition)
5. Final price is clamped to minimum $0

### Multiple rules

Multiple rules can apply simultaneously. They are applied sequentially in the order defined.

Example with base $100, Color Red +$20, Size Large +$50:
- Rule 1: When Color = Red, total gets 10% off
- Rule 2: When Size = Large, Color = Red gets $5 off

Calculation:
1. Base: $100
2. Add options: $100 + $20 + $50 = $170
3. Rule 1 applies (Color = Red): $170 - 10% = $153
4. Rule 2 applies (Size = Large, and Color = Red): $153 - $5 = **$148**

### Data format

Rules are stored as a JSON array in `vendor_responses.rules`:

```json
[
  {
    "conditionParam": "Material",
    "conditionOption": "Wood",
    "targetType": "total",
    "targetParam": "",
    "targetOption": "",
    "discountType": "percentage",
    "discountValue": 10
  },
  {
    "conditionParam": "Color",
    "conditionOption": "Red",
    "targetType": "param_option",
    "targetParam": "Size",
    "targetOption": "XL",
    "discountType": "fixed",
    "discountValue": 5
  }
]
```

## Customer View

Both pricing modes produce prices that appear in the same comparison table. The customer doesn't need to understand the pricing mode - they just select options from dropdowns and see the final prices.

A small badge next to each price indicates whether it was calculated via "combination" or "additive" mode, giving transparency into how the price was determined.
