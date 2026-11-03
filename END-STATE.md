# End state

Confirmed from Hieu Bui’s email, 30 Oct 2026, subject “Ojus Save - Case Study Interview”.
Source: https://mail.google.com/mail/?authuser=ojusave@gmail.com#all/thread-f:1880506561905867187

## The deliverable

Two things, in this order:

1. A basic payments integration built on Adyen’s **test** environment, using only public documentation.
2. A 60-minute session that tells the team what that journey was like.

The job being mirrored is Developer Relations: explore the platform like an outside developer, name the friction, and say what you would change. A working integration is good. Stopping with a clear reason is also a complete result. This is not a code assessment.

## What “done” looks like

A shopper on a CoolBikesCo page, a Dutch bicycle shop that just signed with Adyen, can:

1. See a static list of bikes and select one.
2. See the available payment methods and pay with a credit card on a checkout screen. Adyen’s own hint is to use the feature that builds that checkout UI (Drop-in / sessions), not a hand-built card form.
3. The same payment is findable in the **test Customer Area**, including its API logs.

Proof is a real test payment. A stand-in checkout that never calls Adyen does not meet this. The card is one of Adyen’s published test numbers, not a personal card.

## If time remains

Only after the three items above:

- Refund that payment through the API, not through the Customer Area.
- Pay with iDEAL as well as the card.
- Receive Adyen’s webhook on an endpoint Adyen can reach on the public internet.

## What we bring to the session

60 minutes: about 20 to present, about 20 for their questions, the rest for ours. The presentation covers four things:

1. What was built, or where it stopped.
2. Where it got hard. Specific moments from the friction log: the wrong docs page, the error, the AI suggestion that was wrong, the step that was easier than expected.
3. What a first-time developer feels trying to go live on Adyen.
4. The single change to make first, and why it matters more than the others.

Format can be slides, a short doc, live code, or a mix.

## How we work until then

- Public sources only: docs.adyen.com, the API Explorer, Adyen’s public GitHub and SDKs. No asking Adyen employees for integration help. Hieu is the contact for account setup only.
- Use AI the way this project already does, and write down where it matched the docs and where it did not.
- Any language. Node is already chosen because Drop-in is JavaScript.
- Stop around 3–4 hours. If the clock runs out mid-scenario, stop and record where it landed.
- Keep the friction log while the work is happening. Messy is the point.

## Credentials the end state still needs

Company account `NAAccount827` and client key `test_…` are in hand. The API key sent earlier was rejected by the test Checkout API with 401, so it is not usable until it is saved on the `ws_509582` credential. Checkout also still needs the **merchant account** code under that company, and allowed origin `http://127.0.0.1:4317` on the same credential. HMAC and a public URL matter only for the webhook bonus.
