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
