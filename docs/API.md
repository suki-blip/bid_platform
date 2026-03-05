# API Reference

Base URL: `http://localhost:3000/api`

## Bids

### List All Bids

```
GET /api/bids
```

**Response** `200 OK`
```json
[
  {
    "id": "uuid",
    "title": "Office Furniture",
    "description": "Need desks and chairs",
    "deadline": "2026-04-01",
    "created_at": "2026-03-06 12:00:00",
    "vendor_response_count": 3,
    "parameters": [
      {
        "name": "Material",
        "options": ["Wood", "Steel", "Aluminum"]
      },
      {
        "name": "Color",
        "options": ["Black", "White"]
      }
    ]
  }
]
```

### Create a Bid

```
POST /api/bids
Content-Type: application/json
```

**Request Body**
```json
{
  "title": "Office Furniture",
  "description": "Need desks and chairs for 50 employees",
  "deadline": "2026-04-01",
  "parameters": [
    {
      "name": "Material",
      "options": ["Wood", "Steel", "Aluminum"]
    },
    {
      "name": "Color",
      "options": ["Black", "White"]
    }
  ]
}
```

**Response** `201 Created`
```json
{
  "id": "uuid",
  "title": "Office Furniture",
  "description": "Need desks and chairs for 50 employees",
  "deadline": "2026-04-01",
  "created_at": "2026-03-06 12:00:00"
}
```

### Get Bid Details

```
GET /api/bids/:id
```

**Response** `200 OK`
```json
{
  "id": "uuid",
  "title": "Office Furniture",
  "description": "Need desks and chairs for 50 employees",
  "deadline": "2026-04-01",
  "created_at": "2026-03-06 12:00:00",
  "parameters": [
    {
      "name": "Material",
      "options": ["Wood", "Steel", "Aluminum"]
    }
  ],
  "files": [
    { "id": "uuid", "filename": "specs.pdf" }
  ],
  "vendor_responses": [
    {
      "id": "uuid",
      "bid_id": "uuid",
      "vendor_name": "Acme Corp",
      "pricing_mode": "combination",
      "base_price": null,
      "rules": [],
      "submitted_at": "2026-03-06 14:00:00",
      "prices": [
        {
          "id": "uuid",
          "response_id": "uuid",
          "combination_key": "{\"Color\":\"Black\",\"Material\":\"Wood\"}",
          "price": 150.00
        }
      ]
    },
    {
      "id": "uuid",
      "bid_id": "uuid",
      "vendor_name": "Beta Inc",
      "pricing_mode": "additive",
      "base_price": 100.00,
      "rules": [
        {
          "conditionParam": "Material",
          "conditionOption": "Wood",
          "targetType": "total",
          "targetParam": "",
          "targetOption": "",
          "discountType": "percentage",
          "discountValue": 10
        }
      ],
      "submitted_at": "2026-03-06 15:00:00",
      "prices": [
        {
          "id": "uuid",
          "response_id": "uuid",
          "combination_key": "{\"param\":\"Color\",\"option\":\"Black\"}",
          "price": 20.00
        },
        {
          "id": "uuid",
          "response_id": "uuid",
          "combination_key": "{\"param\":\"Material\",\"option\":\"Wood\"}",
          "price": 30.00
        }
      ]
    }
  ]
}
```

**Response** `404 Not Found`
```json
{ "error": "Bid not found" }
```

## Vendor Responses

### Submit Vendor Prices

```
POST /api/bids/:id/respond
Content-Type: application/json
```

Supports two pricing modes. The `pricing_mode` field determines how prices are interpreted.

#### Combination Mode (default)

**Request Body**
```json
{
  "vendor_name": "Acme Corp",
  "pricing_mode": "combination",
  "prices": [
    {
      "combination_key": "{\"Color\":\"Black\",\"Material\":\"Wood\"}",
      "price": 150.00
    },
    {
      "combination_key": "{\"Color\":\"White\",\"Material\":\"Wood\"}",
      "price": 160.00
    }
  ]
}
```

#### Additive Mode

**Request Body**
```json
{
  "vendor_name": "Beta Inc",
  "pricing_mode": "additive",
  "base_price": 100.00,
  "prices": [
    {
      "combination_key": "{\"param\":\"Color\",\"option\":\"Black\"}",
      "price": 20.00
    },
    {
      "combination_key": "{\"param\":\"Material\",\"option\":\"Wood\"}",
      "price": 30.00
    }
  ],
  "rules": [
    {
      "conditionParam": "Material",
      "conditionOption": "Wood",
      "targetType": "total",
      "targetParam": "",
      "targetOption": "",
      "discountType": "percentage",
      "discountValue": 10
    }
  ]
}
```

| Field | Required | Description |
|---|---|---|
| `vendor_name` | Yes | Company name |
| `pricing_mode` | No | `"combination"` (default) or `"additive"` |
| `base_price` | For additive | Base price before option additions |
| `prices` | Yes | Array of combination_key + price entries |
| `rules` | No | Conditional discount rules (additive mode only) |
```

**Response** `201 Created`
```json
{
  "id": "uuid",
  "bid_id": "uuid",
  "vendor_name": "Acme Corp",
  "submitted_at": "2026-03-06 14:00:00",
  "prices": [...]
}
```

## Files

### Upload Files

```
POST /api/bids/:id/files
Content-Type: multipart/form-data
```

**Form Fields**
- `files`: One or more files (multiple allowed)

**Response** `201 Created`
```json
[
  { "id": "uuid", "filename": "specs.pdf" },
  { "id": "uuid", "filename": "drawing.png" }
]
```

### List Files

```
GET /api/bids/:id/files
```

**Response** `200 OK`
```json
[
  { "id": "uuid", "filename": "specs.pdf" },
  { "id": "uuid", "filename": "drawing.png" }
]
```

### Download File

```
GET /api/bids/:id/files/:fileId
```

**Response** `200 OK`
- Returns the file binary with appropriate `Content-Type` header
- `Content-Disposition: attachment; filename="specs.pdf"`

Supported content types: PDF, PNG, JPG, GIF, SVG, DOC, DOCX, XLS, XLSX, CSV, TXT, JSON, ZIP. Falls back to `application/octet-stream`.

## Error Responses

All endpoints return errors in this format:

```json
{ "error": "Error description" }
```

| Status | Meaning |
|---|---|
| 400 | Bad request (missing fields) |
| 404 | Resource not found |
| 500 | Internal server error |
