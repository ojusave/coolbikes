# CoolBikes friction log

Running notes for the Adyen Developer Relations case study. Messy is fine.

## 1. Signing up for a test account

The brief says account setup goes through the point of contact, then never gives credentials. The public path is `docs.adyen.com` → “creating a free test account” → `adyen.com/signup`, which is a sales form: legal entity country, business email, company, live website, phone, annual volume in USD (floor is 0–1 million). Third-party notes say Gmail is rejected. Even after submit you wait for an activation email, set a password, turn on MFA, then dig for API credentials under Developers. No instant sandbox key.

Outside confirmation: Cal.com PR notes domain email requirement; Shuttle sandbox guide lists activation → MFA → API credentials; AgentsReady scores ~30 minutes to a key with human gates.

Outcome for this exercise: Sales later emailed `NAAccount827` / `admin` to `i@saveoj.us` with a password-set link, still no API key or merchant account in the mail.

## 2. API key docs still describe tabs the test Customer Area does not show

Checked 1 Nov 2026 against the live page and a screenshot of the test Customer Area.

Docs, [Generate an API key](https://docs.adyen.com/development-resources/api-credentials#generate-api-key), still say:

1. Log in and select the company account.
2. Go to Developers > API credentials.
3. Select the **Payments** or **Platforms** tab.
4. Select the credential username.
5. Under Server settings > Authentication, open the API key tab, generate, copy, then Save changes.

The same Payments or Platforms tab is step 3 of "Create additional API credentials" on that page. The create button in the docs is "Create new credential."

The test Customer Area list, `https://ca-test.adyen.com/ca/ui/developers/api-credentials/`, with company `NAAccount827` selected:

- Developers > API credentials is correct, and the account switcher shows the company.
- There is no Payments tab and no Platforms tab. One table, filtered by `Account: NAAccount827`.
- Columns are Username, Status, Type, Description, Accounts, Credential ID, Creation date.
- The button is **+ Create credential**, not "Create new credential."
- The five rows are typed Web Service or Reporting (`ws_509582`, `report`, `pos_certificate`, `pos_ws`, `ws`), not split into those two tabs.

Steps 1 and 2 match. Step 3 sends you looking for a control that is not on the page. The inner "Generate API key" screen was not in this screenshot, so that part is not confirmed either way.

## 3. Signing in takes three identifiers, and "Account" is the wrong word

Screenshot of the Customer Area login, 2 Nov 2026. Test is selected. Username is `admin`. The account field is `NAAccount827`. A password is filled in. Remember account is checked. Buttons are Log in and Switch user.

The welcome email only named two of these: account `NAAccount827` and username `admin`. The password was not in the mail. It was a link that expires in about 14 days, sent to `i@saveoj.us`.

What the form adds:

- A Live / Test switch on the same screen. The email points at the test Customer Area, and the form still lets you pick Live with those same fields.
- An Account box that is the company account. Checkout's `merchantAccount` is a different code, and the API user is a third string, `ws_509582@Company.NAAccount827`. The form just says Account.
- Switch user next to Log in, before any session exists. The label does not say what it switches.

The page does not show an error in this screenshot. The friction is getting the three fields to match the email before the dashboard, and not putting the web-service username or a merchant account into Account.

## 4. Generate API key does nothing until Save changes

On `ws_509582`, generating a key looks finished. The value is on screen, and the docs say you cannot copy it again after you leave the page. The key is not stored unless you also click **Save changes**.

The first key copied from that screen was rejected by the test Checkout API and by Adyen's MCP with **401 Unauthorized**. A later key, generated and saved, was accepted. `list_merchant_accounts` then returned an empty list instead of 401.

Generate and Save are two steps. The page treats the first one as the result. Leaving without the second one throws away the only copy and leaves the old key, or no key, in place.

## 5. The company account is not a merchant account

The first merchant code tried, `NAAccount827_CycleTest_TEST`, authenticated and then returned no payment methods. Checkout only showed methods after switching to `NAAccount827ECOM`. The company name, the web-service user, and the merchant account are three different strings, and an empty method list does not say which one is wrong.

## 6. iDEAL test flow lands on Adyen's moneyapp simulator

After selecting iDEAL and submitting, the shopper is redirected to Adyen's test issuer page (moneyapp) showing amount, IBAN, receiver, and "Authorize payment / Cancel payment" buttons. The button did not respond to clicks in the embedded checkout; unclear whether this is Adyen's simulator or our redirect/iframe setup. Need to retest in a top-level tab and check console errors.

## 7. AI workflow: what worked and what needed correction

Reconstructed on 2 November from retained build history, not a contemporaneous addition to the original log. The examples below occurred in the earlier TypeScript `coolbikesco` prototype on 31 October. The current JavaScript `coolbikes` app is a later implementation; do not attribute the earlier build's tests or SDK versions to it.

The workflow was public Adyen documentation → generated implementation → installed SDK declarations → compilation and offline checks → browser interaction. The instruction was to build the integration; the code suggestions below are retained artifacts, not reconstructed prompt quotations.

### Useful output: Sessions and Drop-in

The assistant used the official Sessions guide and generated server-side session creation with the official Node library, plus the v6 `AdyenCheckout` and `Dropin` named exports in the browser. It checked version context and installed declarations rather than mixing in older `checkout.create('dropin')` examples. The earlier prototype subsequently built and passed eight offline tests. That validates a useful implementation scaffold, not an actual Adyen payment. The current app also uses Sessions and Drop-in.

### Observed mistake: plausible but incorrect SDK configuration

- Generated suggestion: `new Client({ environment: 'TEST', timeout: 15000, ... })`.
- Verification: the first TypeScript check failed with TS2322 because the string `"TEST"` was not assignable to `EnvironmentEnum`. Inspection of the installed configuration declarations also showed that the timeout property was `connectionTimeoutMillis`.
- Correction: import `EnvironmentEnum`, use `EnvironmentEnum.TEST`, and set `connectionTimeoutMillis: 15000`.
- Outcome: subsequent build and offline checks passed. No payment request was needed to catch this error.
- Lesson: a plausible AI configuration needs verification against the installed SDK. Its types helped diagnose an assistant mistake; this was not an Adyen API failure.

### Observed mistake: a browser assumption that compilation missed

- Generated behavior: create a UUID before rendering checkout or checking missing configuration.
- Verification: selecting Canal Cruiser in the HTTP managed preview did nothing; the browser console reported `TypeError: crypto.randomUUID is not a function`.
- Correction: render the selected bike and setup blocker first, then require a secure context before starting a payment session and generating the UUID.
- Outcome: the build history records the fix and browser testing of all three product selections. Actual payment verification remained blocked by account access in that earlier run.
- Lesson: browser interaction caught an AI implementation error that compilation and offline server tests did not. This was a preview-context issue, not evidence that Adyen rejected a payment.

Evidence: retained Codex build chat `01a191ef-c662-7622-8533-0b17b063702c`, original friction entries F03, F04, and F08; compiler output and correction are recorded in that chat. No exact prompt wording, time-to-fix, or payment outcome has been invented.

## 8. The one improvement I would prioritize

**A guided first-checkout check in the test Customer Area.** Give a developer one place to establish that their saved credential and selected merchant are ready for the first Sessions + Drop-in checkout.

The evidence is the repeated ambiguity in entries 2–5: documentation points to absent tabs; a generated key looks ready before Save changes; company, credential, and merchant identifiers are easy to confuse; and an empty payment-method list gives little direction. Each leaves the developer deciding whether to debug code, credentials, or account configuration before they have one successful payment.

The proposed flow would explicitly select a merchant, distinguish it from the company/login identifiers, confirm that credential changes were saved, and show the relevant scope, origin, and payment-method checks for the intended NL/EUR checkout. Where a check cannot establish a cause, it should say what remains unknown rather than blame a particular setting. Finish with a minimal Sessions example populated with non-secret configuration and a path to its API log. This is a proposal, not a claim that such diagnostics already exist.

Why first: these blockers occur before the developer's first successful checkout, and AI can generate plausible code without knowing the account state. Clarifying that boundary helps both human and AI-assisted integrations. I would prioritize it ahead of simulator polish or more sample endpoints because those help later in the journey. That prioritization is a hypothesis from this exercise, not a measured finding across merchants.

I would evaluate it with first-time developers: time from credential creation to the first successful test checkout; avoidable credential/merchant corrections; and whether they can correctly identify the next action after a failed check. Establish a baseline before promising an improvement percentage.

## 9. Exact bonus claims for the presentation

- **Refund/cancellation:** the invoice initiates an API request outside Customer Area. The adapter calls `/payments/{pspReference}/reversals`, through `refundOrCancelPayment`. It can cancel an uncaptured authorization or refund a captured payment. Describe it as a refund-or-cancellation request; an accepted request is not evidence of a completed refund. A completed-refund claim needs the correlated final outcome for a captured payment. This review did not establish that outcome.
- **iDEAL:** selection and redirect to the test simulator were observed. Authorization/completion remains blocked as described in entry 6. Do not call this an end-to-end iDEAL success or assign the root cause to Adyen without further evidence.
- **Webhooks:** a receiver and event viewer exist in code. HMAC verification runs only when its key is configured. Code presence and locally simulated events do not establish delivery from Adyen over the public internet; that needs a real correlated delivery record. This review did not establish one.

Suggested spoken wording: “I added an API refund-or-cancellation request and a webhook receiver. For iDEAL I reached the test simulator, but could not complete authorization in the embedded browser. I have not established the final refund outcome or public webhook delivery in the evidence reviewed here.”
