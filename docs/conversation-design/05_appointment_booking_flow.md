# Appointment Booking Flow

> **Flow type:** `appointment_booking`
> **Implementation:** `vapi/flows/vapi-appointment-booking-flow.ts`
> **Trigger:** Customer explicitly asks to schedule a call or meeting ("Can I book a demo?", "I'd like to schedule an appointment", "Can someone call me back at a specific time?").

## 1. Description

The Appointment Booking flow handles callers who want to schedule a follow-up call or meeting with a Dayjoy team member. This is a high-intent signal — the customer is willing to commit time to a conversation, which makes appointment capture the second-most-important conversion event after lead capture (the two are often linked: a lead is captured, then an appointment is booked to follow up).

Sarah's job in this flow is to **collect the minimum viable information, confirm it by repeating it back, persist the appointment, and give the customer a reference number**. She does not negotiate availability — the appointment is created with whatever date + time the customer proposes, and the assigned team member confirms or reschedules via the standard appointment workflow.

## 2. Customer Journey

```
                    ┌──────────────────────────┐
                    │  Customer wants meeting  │
                    └─────────────┬────────────┘
                                  │
                                  ▼
                    ┌──────────────────────────┐
                    │  Greeting                │
                    └─────────────┬────────────┘
                                  │
                                  ▼
                    ┌──────────────────────────┐
                    │  Collect date + time     │  "When would you like to schedule?"
                    └─────────────┬────────────┘
                                  │
                                  ▼
                    ┌──────────────────────────┐
                    │  Collect purpose         │  "What's this about?"
                    │  (title / department)    │
                    └─────────────┬────────────┘
                                  │
                                  ▼
                    ┌──────────────────────────┐
                    │  Confirm details         │  "Wednesday, January 15 at 2:30 PM..."
                    │  (repeat back)           │
                    └─────────────┬────────────┘
                                  │
                                  ▼
                    ┌──────────────────────────┐
                    │  book_appointment tool   │
                    └─────────────┬────────────┘
                                  │
                                  ▼
                    ┌──────────────────────────┐
                    │  Send confirmation       │  Reference number + email
                    └─────────────┬────────────┘
                                  │
                                  ▼
                    ┌──────────────────────────┐
                    │  Close                   │
                    └──────────────────────────┘
```

## 3. Steps in Detail

| Step | Assistant action | Tool calls |
|---|---|---|
| `greeting` | Standard greeting. If caller is identified, greet by name. | (caller ID lookup already done) |
| `gather_datetime` | Ask when the customer wants the appointment. Parse natural-language date/time ("next Wednesday at 2:30 PM") into ISO 8601. Reject past dates. | (none — date parsing is done in flow code) |
| `gather_purpose` | Ask what the appointment is for. Map to a `department` (`sales`, `business_development`, `customer_service`, `technical_support`). | (none) |
| `confirm` | Repeat back: date, time, purpose, name, email, phone. Wait for explicit "yes". | (none) |
| `book` | Call `book_appointment`. If it fails, apologise and offer to transfer. | `book_appointment` |
| `close` | Mandatory closing question + sign-off. | (none) |

## 4. Example Conversation

```
Sarah:  Hi Vikram, thanks for calling Dayjoy. How can I help?

Vikram: I'd like to schedule a call with someone from your sales team
        to discuss bulk pricing for my office.

Sarah:  Absolutely. When would you like to schedule the call?

Vikram: Next Wednesday afternoon, around 2:30.

Sarah:  Got it — Wednesday, January 15 at 2:30 PM. The call will be
        with our sales team about bulk pricing. Can I confirm your
        email for the calendar invite?

Vikram: vikram@officemail.com.

Sarah:  And the phone number for the call — is +91 98765 43210 still
        the best number?

Vikram: Yes, that's right.

Sarah:  Let me confirm everything: a 30-minute call with our sales
        team on Wednesday, January 15 at 2:30 PM, with Vikram at
        +91 98765 43210 and vikram@officemail.com. Is that correct?

Vikram: Yes, perfect.

Sarah:  [book_appointment(title="Bulk pricing discussion",
            scheduledAt="2025-01-15T14:30:00+05:30",
            durationMinutes=30, department="sales",
            customerName="Vikram",
            customerEmail="vikram@officemail.com",
            customerPhone="+919876543210",
            notes="Customer wants bulk pricing for office order")]
        Perfect! I've scheduled your appointment for Wednesday,
        January 15 at 2:30 PM. You'll receive a confirmation email
        at vikram@officemail.com. Your reference number is E4K7P2M3.
        We look forward to speaking with you. Is there anything else
        I can help you with?

Vikram:  No, that's all. Thanks!

Sarah:  Thank you for calling Dayjoy. Have a great day!
```

## 5. Tools Used

| Tool | When | Why |
|---|---|---|
| `customer_lookup` | At call start (caller ID) | Identify the caller; the appointment is linked to their customer record |
| `book_appointment` | In `book` step | Persist the appointment with all details; returns the reference number |
| `human_transfer` | On escalation trigger or tool failure | Transfer to the relevant department if booking fails |

## 6. Escalation Triggers

| Trigger | Action |
|---|---|
| Customer asks for a specific person ("Can I book with Rohit?") | Sarah explains she cannot route to a specific person; transfers to the relevant department so they can assign |
| Customer asks for an appointment outside business hours | Sarah explains the team's availability and asks for an alternative time |
| `book_appointment` fails 2 times | Transfer to the relevant department + create a support ticket |
| Customer is upset / abusive | Transfer to `manager` (priority `urgent`) |
| Customer asks for a same-day appointment | Sarah tries; if no slot is available, offers next-day + a callback ticket |
| Customer asks for a meeting at a specific physical location | Sarah captures the location and offers to transfer to sales to confirm availability |

## 7. Success Criteria

- **Booking success rate ≥ 95%** — the `book_appointment` call succeeds on the first try for at least 95% of calls.
- **Confirmation accuracy = 100%** — every detail Sarah repeats back matches what is persisted (date, time, name, email, phone).
- **No-show rate ≤ 25%** — of appointments booked via voice, no more than 25% should be no-shows (measured against the standard CRM no-show benchmark).
- **Average handle time ≤ 3 minutes** — the flow is short and transactional.
- **Customer satisfaction ≥ 4.3 / 5** — measured by the post-call survey.

## 8. Edge Cases

- **Customer gives a vague date** ("sometime next week"): Sarah asks for a specific day and time — she does not create an appointment with an unspecified slot.
- **Customer gives a past date**: Sarah catches it ("That time has already passed — could you give me a future date?") and asks again.
- **Customer is in a different time zone** (NRI caller): Sarah asks which city they're in, converts to IST for the appointment, and confirms the local time back to the customer.
- **Customer wants to reschedule an existing appointment**: Sarah asks for the existing reference number; if provided, she updates the appointment (currently via a support ticket — full reschedule flow is on the roadmap).
- **Customer wants to cancel an existing appointment**: Same as reschedule — captured as a ticket for the support team.
- **Customer asks for a video call** (vs phone): Sarah captures the preference in `notes`; the assigned team member sends a meeting link via email.
- **Customer asks for an appointment with a specific product expert**: Sarah explains that she routes by department; the department will assign the right expert. She captures the request in `notes`.
- **Customer provides an invalid email**: Sarah asks again ("That email doesn't look right — could you repeat it?"); if it fails twice, she captures the appointment with phone-only confirmation.
- **Customer wants an appointment more than 60 days out**: Sarah captures it but warns that team availability may change; offers to send a reminder email closer to the date.
