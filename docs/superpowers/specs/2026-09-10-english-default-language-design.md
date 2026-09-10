# English Default Language Design

## Goal

Use English (`en-US`) when MyMusic starts without a previously saved language preference.

## Behavior

- A new installation defaults to English.
- A user-selected language stored under `app.language` remains unchanged across launches and upgrades.
- An absent, invalid, or unsupported saved locale falls back to English.
- The language settings screen continues to offer English, Simplified Chinese, and Traditional Chinese.

## Implementation

Keep the existing localization architecture and persistence key. Make English the explicit default and fallback language in the i18n module instead of relying on the first entry in the supported-language array. This avoids coupling fallback behavior to array order.

## Verification

Add focused unit tests covering:

1. no saved preference selects English;
2. a valid saved preference is preserved;
3. an invalid saved preference falls back to English;
4. selecting a language persists that locale.

Run the unit suite, coverage, typecheck, and read-only lint. Build and install a signed iOS Release after the automated checks pass.

## Out of Scope

- Translating currently untranslated source strings.
- Changing the device or operating-system language.
- Removing Chinese language support.
