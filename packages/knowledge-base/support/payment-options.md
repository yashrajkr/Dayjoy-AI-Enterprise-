# Payment Options

> **Status:** VERIFIED / PARTIALLY VERIFIED
> **Last updated:** 2026-08-04
> **Category:** Support
> **Tags:** customer-facing, policy, payments, support, security
> **Primary Sources:** `docs/research/05_Policies.md`, `packages/knowledge-base/policies/policies.md`, official Dayjoy website

---

## 1. Overview

Dayjoy Marketing Private Limited offers multiple payment options for customers and distributors purchasing products through the official website (`dayjoy.in`), the distributor portal (Phase 2), and franchisee outlets. This document outlines accepted payment methods, EMI options, payment security, and payment failure handling.

### 1.1 Payment Processing

- All online payments are processed through PCI-DSS compliant payment gateways.
- Dayjoy does not store credit/debit card details on its servers — all card data is handled by the payment gateway.
- All payment transactions are encrypted using TLS 1.3.
- Invoices are generated automatically and emailed to the customer upon successful payment.

---

## 2. Accepted Payment Methods

### 2.1 Online Payment Methods (Website & Portal)

| Payment Method | Status | Notes |
|---|---|---|
| Credit Cards (Visa, Mastercard, RuPay, American Express) | PARTIALLY VERIFIED | All major Indian and international cards |
| Debit Cards (Visa, Mastercard, RuPay) | PARTIALLY VERIFIED | All major Indian debit cards |
| UPI (PhonePe, Google Pay, Paytm, BHIM, etc.) | PARTIALLY VERIFIED | All UPI apps supported |
| Net Banking (50+ Indian banks) | PARTIALLY VERIFIED | Major banks: SBI, HDFC, ICICI, Axis, Kotak, etc. |
| Wallets (Paytm, Mobikwik, Amazon Pay) | PARTIALLY VERIFIED | Select wallets |
| Cash on Delivery (COD) | PARTIALLY VERIFIED | Up to ₹[PLACEHOLDER — typical: 5,000–10,000]; convenience fee ₹[PLACEHOLDER] |
| Distributor Wallet (internal credit) | PARTIALLY VERIFIED | For distributors with prepaid balance |

### 2.2 Offline Payment Methods (Franchisee / Office)

| Payment Method | Status | Notes |
|---|---|---|
| Cash | VERIFIED | At office / franchisee outlets |
| Cheque (in favor of "Dayjoy Marketing Private Limited") | PARTIALLY VERIFIED | Subject to clearance |
| Demand Draft (DD) | PARTIALLY VERIFIED | Subject to clearance |
| UPI (in-store QR) | PARTIALLY VERIFIED | At franchisee outlets |
| Card swipe (POS terminal) | PARTIALLY VERIFIED | At franchisee outlets with POS |

### 2.3 Bank Transfer / NEFT / RTGS / IMPS

For bulk orders and B2B transactions:

- **Beneficiary Name:** Dayjoy Marketing Private Limited
- **Bank Account Number:** [PLACEHOLDER — client to provide]
- **Bank Name:** [PLACEHOLDER]
- **Branch:** [PLACEHOLDER]
- **IFSC Code:** [PLACEHOLDER]
- **Account Type:** Current Account
- **GSTIN:** 08AAGCD8452J1ZA (for invoice reference)

> **Note:** Customers using bank transfer must email the transaction reference / UTR number to Customer Care for order confirmation.

---

## 3. EMI Options

### 3.1 Credit Card EMI

- **Available on:** Credit card purchases above ₹[PLACEHOLDER — typical: 3,000]
- **Tenure options:** 3, 6, 9, 12, 18, 24 months
- **Interest rate:** [PLACEHOLDER — typical: 12–18% per annum, varies by bank]
- **Processing fee:** [PLACEHOLDER — typical: ₹99–₹499]
- **Banks supported:** [PLACEHOLDER — typical: SBI, HDFC, ICICI, Axis, Kotak, Bajaj Finserv, etc.]
- **No-cost EMI:** Available on select products during promotional periods (see Marketing → Promotional Offers).

### 3.2 Debit Card EMI

- **Available on:** Select debit cards (HDFC, SBI, ICICI, Axis, Kotak) above ₹[PLACEHOLDER — typical: 5,000–10,000]
- **Tenure options:** 3, 6, 9, 12 months
- **Interest rate:** [PLACEHOLDER]
- **Eligibility:** Pre-approved customers of the respective banks.

### 3.3 Bajaj Finserv EMI Card

- **Available on:** Bajaj Finserv EMI Network Card holders
- **Tenure options:** 3, 6, 12, 18, 24 months
- **No-cost EMI:** Available (subject to offers)
- **Down payment:** Nil (subject to card limit)

### 3.4 EMI Process

1. Customer selects "EMI" at checkout.
2. Customer selects bank and tenure.
3. Customer completes EMI authorization with the bank.
4. Order is confirmed once bank approves the EMI conversion.
5. Monthly EMI is auto-debited from the customer's card / bank.

> **Note:** EMI cancellation / foreclosure is governed by the bank's terms, not Dayjoy's. Refunds for EMI orders follow the standard refund policy; the bank handles EMI closure.

---

## 4. Payment Security

### 4.1 Encryption & Compliance

- All payment pages use **TLS 1.3** encryption.
- Payment gateway is **PCI-DSS Level 1** compliant.
- Card data is **never stored** on Dayjoy servers — tokenization is used where needed.
- 3D Secure (OTP-based authentication) is mandatory for all card transactions.

### 4.2 Fraud Prevention

- Real-time fraud detection on every transaction.
- Velocity checks (multiple transactions from same card/IP flagged).
- Address Verification System (AVS) for international cards.
- CVV mandatory for every card transaction.
- Suspicious transactions are held for manual review.

### 4.3 Customer Responsibilities

- Do not share card details, OTPs, or UPI PINs with anyone, including Dayjoy employees.
- Always transact only on the official website `dayjoy.in` or authorized portals.
- Report suspicious activity to Customer Care immediately.
- Use strong passwords for the Customer Portal (Phase 2) and enable two-factor authentication where available.

> **IMPORTANT:** Dayjoy employees, distributors, or support agents will **never** ask for a customer's card number, CVV, OTP, UPI PIN, or net banking password. If anyone claiming to be from Dayjoy requests this information, it is a fraud attempt — report immediately to grievance@dayjoy.in [PLACEHOLDER].

---

## 5. Payment Failure Handling

### 5.1 Common Reasons for Payment Failure

- Insufficient funds / credit limit.
- Incorrect card details entered.
- OTP not received / incorrect OTP entered.
- Bank server downtime.
- 3D Secure authentication failed.
- International card not supported for domestic transactions.
- UPI app timeout.
- Exceeded transaction limit (per transaction or per day).

### 5.2 What Happens When Payment Fails

1. Customer is notified immediately on the checkout page.
2. Order is **not placed** (no money is debited from customer's account).
3. If money is debited but order is not placed (rare), the amount is **auto-refunded** within [PLACEHOLDER — typical: 5–7 business days].
4. Customer can retry payment with the same or different method.

### 5.3 Pending Payments

If a payment shows as "pending" (debit made, order not confirmed):

1. Wait 24 hours — most pending payments auto-resolve.
2. If still pending after 24 hours, contact Customer Care with:
   - Order attempt ID (if generated)
   - Transaction reference number from bank
   - Date and time of transaction
   - Amount
   - Payment method used
3. Customer Care verifies with the payment gateway and bank.
4. If payment is confirmed on Dayjoy's end, order is processed.
5. If payment is not confirmed within 7 business days, refund is initiated.

### 5.4 Double Charges

In rare cases, a customer may see two charges for the same order (gateway timeout + retry). Resolution:

1. Customer reports to Customer Care with both transaction references.
2. Dayjoy verifies with the payment gateway.
3. Duplicate charge is refunded within [PLACEHOLDER — typical: 5–7 business days].

---

## 6. Invoice & Tax

### 6.1 Invoice Generation

- An invoice is automatically generated and emailed upon successful payment.
- Invoice includes: GSTIN, product details, quantity, MRP, discount, taxable value, CGST, SGST/IGST, total amount.
- Customers can download invoices from the Customer Portal (Phase 2) or request a copy from Customer Care.

### 6.2 GST

- **Dayjoy GSTIN:** 08AAGCD8452J1ZA
- **GST rates:** Applicable GST rates per product category (see `compliance/gst-tax-information.md`).
- **Inter-state sales:** IGST applied.
- **Intra-state sales (Rajasthan):** CGST + SGST applied.
- **GST invoice:** Provided for every B2B and B2C transaction.
- **GST credit:** Distributors with valid GSTIN can claim input tax credit.

---

## 7. Refunds

For refund process and timelines, see `support/return-policy.md`. Quick summary:

| Payment Method | Refund Method | Processing Time |
|---|---|---|
| Credit / Debit Card | Back to original card | 7–10 business days |
| UPI / Wallet | Back to original UPI / wallet | 3–5 business days |
| Net Banking | Back to original bank account | 5–7 business days |
| COD | Bank transfer / cheque | 10–14 business days |
| EMI | Back to original card; EMI closure handled by bank | 7–10 business days |

---

## 8. International Payments

Dayjoy currently accepts payments only in **Indian Rupees (INR)** from Indian payment instruments. International payments are not supported as international shipping is not offered (see `support/shipping-policy.md`).

---

## 9. Pricing & Currency

- All prices are displayed in Indian Rupees (INR) inclusive of GST.
- MRP (Maximum Retail Price) and DP (Distributor Price) are displayed where applicable.
- Prices are subject to change without prior notice.
- Prices at the time of order placement are honored — no post-order price adjustments for price drops.

---

## 10. Open Questions for Client

1. Confirm COD limit and convenience fee.
2. Confirm EMI eligibility threshold and supported banks.
3. Confirm no-cost EMI offers (which products, which tenures).
4. Confirm Bajaj Finserv EMI Card acceptance.
5. Confirm bank account details for NEFT/RTGS/IMPS.
6. Confirm wallet partners (Paytm, Mobikwik, Amazon Pay, etc.).
7. Confirm refund processing time guarantees per payment method.
8. Confirm two-factor authentication availability on Customer Portal (Phase 2).

---

**END OF DOCUMENT**
