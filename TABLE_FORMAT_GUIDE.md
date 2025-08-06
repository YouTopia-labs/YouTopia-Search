# Table Format Guide

## Simple Table Format Requirements

The AI model has been updated to generate only simple, reliable table formats to prevent JSON parsing errors.

### ✅ Correct Format

```json
{
  "headers": ["Name", "Price", "Rating"],
  "data": [
    ["Product A", "$99", "4.5"],
    ["Product B", "$149", "4.2"],
    ["Product C", "$199", "4.8"]
  ]
}
```

### 📋 Strict Rules

1. **Only 2 properties allowed**: `headers` and `data`
2. **Headers**: Array of simple strings (max 4 columns)
3. **Data**: Array of arrays, each row matching header count (max 8 rows)
4. **Cell values**: Simple strings or numbers only
5. **No special characters**: Avoid quotes ("), commas (,), line breaks (\n) in cell values
6. **Simple formatting**: Use "$99" not "$1,999", "4.5" not "4.5/5"

### ❌ What NOT to Do

```json
// ❌ Extra properties
{
  "title": "My Table",
  "headers": ["Name"],
  "data": [["Item"]]
}

// ❌ Complex cell values
{
  "headers": ["Name", "Price (USD)", "Rating (1-5)"],
  "data": [["Product A", "$1,999", "4.5/5"]]
}

// ❌ Special characters in cells
{
  "headers": ["Item"],
  "data": [["Product with \"quotes\""], ["Item, with comma"]]
}
```

### 🔧 Error Prevention

The system now includes:
- Strict JSON validation
- Property name checking
- Cell value validation
- Clear error messages
- Automatic format enforcement

### 🧪 Testing

Use `test_table.html` to test table formats and see validation in action.