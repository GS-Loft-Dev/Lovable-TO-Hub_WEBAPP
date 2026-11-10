# Contributing

Thanks for helping! The most valuable contributions are **real pages that convert badly**: they show where the detection heuristics fall short.

## Reporting a conversion problem

Open an issue with:

- the public URL of the Lovable page (or a saved copy of its rendered HTML);
- what you expected (e.g. "the pricing cards should be a repeater");
- the HubSpot validation error, if publishing failed.

## Making changes

1. `npm install`, then `npm test`. The render tests need Chrome or Chromium; set `CHROME_PATH` if it isn't auto-detected.
2. Converter changes go in `src/lib/converter/` and need a test in `test/converter.test.ts`. The usual pattern is to add the markup that broke to a fixture in `test/fixtures/` and assert on the generated fields or HubL.
3. Keep the converter pure: no network and no filesystem access, so it stays easy to test.
4. Run `npm run typecheck` and `npm run build` before opening a PR.

## Scope

In scope:

- better structure detection;
- more field types;
- HubSpot features such as forms and page creation;
- other AI site builders that publish a rendered URL.

Out of scope:

- anything that scrapes sites the user doesn't own;
- anything that bypasses the Lovable or HubSpot APIs' authentication.
