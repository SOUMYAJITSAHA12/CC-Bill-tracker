# BillDesk reverse engineering notes

## Network endpoint

`POST https://hexagon.billdesk.com/hgapp-instapay/InstaPayController`

Body shape:

```json
{
  "MB": {
    "OPERATIONID": "NLIINIT",
    "SESSIONKEY": "...",
    "REQTOKEN": "...",
    "RQ": {
      "APPINFO": { "APPID": "KTK03", "CHANNEL": "Internet", "APPVER": "1.0" },
      "DEVICEINFO": { ... },
      "REQDATA": "<encrypted base64>"
    }
  }
}
```

## Known operations

| Step | OPERATIONID |
|------|-------------|
| Session init | `NLIINIT` |
| List billers | `NLIBILLERS` |
| Search billers (Credit Card) | `NLIBILLERLSSEARCH` — `{ biller_category, searchstring }` (min 3 chars) |
| Biller details | `NLIBILLERS` — `{ billerid }` |
| Fetch bill (Get Bill) | `NLIVALIDATEPAYMENT` — `{ billerid, authenticators, customer, device, risk }` |

## Crypto (implemented)

See `lib/billdesk/crypto.ts` — AES-GCM + SHA256 key derivation from `main.*.js`.

Constants: `encryptDecryptRandomKey`, `certThumbKey` (hardcoded in portal JS).

Pre-login (`KTK03`): encrypt key = `OPERATIONID` only; decrypt splits `OP|SESSION` to `OP`.

## JS bundle

`https://hexagon.billdesk.com/hgapp-instapay/main.<hash>.js`

Search: `REQDATA`, `encrypt`, `decrypt`, `AES`, `CryptoJS`
