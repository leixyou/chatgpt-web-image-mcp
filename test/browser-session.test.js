import assert from "node:assert/strict";
import test from "node:test";

import { persistentContextOptions } from "../src/browser-session.js";
import { BrowserSession } from "../src/browser-session.js";

function fakePage(initialUrl) {
  let currentUrl = initialUrl;
  const navigations = [];
  return {
    navigations,
    url() {
      return currentUrl;
    },
    async goto(targetUrl) {
      navigations.push(targetUrl);
      currentUrl = targetUrl;
    },
  };
}

test("launches the dedicated Chrome profile with the Chromium sandbox enabled", () => {
  const options = persistentContextOptions({
    chromeChannel: "chrome",
    headless: false,
  });

  assert.equal(options.chromiumSandbox, true);
  assert.equal(options.channel, "chrome");
  assert.equal(options.headless, false);
  assert.deepEqual(options.viewport, { width: 1440, height: 1100 });
});

test("CDP mode opens a new tab instead of navigating an operator tab", async () => {
  const normalTab = fakePage("https://example.com/work");
  const otherChatGptTab = fakePage("https://chatgpt.com/c/personal-chat");
  const newTab = fakePage("about:blank");
  let newPageCalls = 0;
  const session = new BrowserSession({ cdpUrl: "http://127.0.0.1:9222" });
  session.context = {
    pages: () => [normalTab, otherChatGptTab],
    async newPage() {
      newPageCalls += 1;
      return newTab;
    },
  };

  const page = await session.getPage("https://chatgpt.com/images/");

  assert.equal(page, newTab);
  assert.equal(newPageCalls, 1);
  assert.deepEqual(normalTab.navigations, []);
  assert.deepEqual(otherChatGptTab.navigations, []);
  assert.deepEqual(newTab.navigations, ["https://chatgpt.com/images/"]);
});

test("CDP mode reuses an exact target tab without opening another tab", async () => {
  const target = fakePage("https://chatgpt.com/images/");
  const session = new BrowserSession({ cdpUrl: "http://127.0.0.1:9222" });
  session.context = {
    pages: () => [target],
    async newPage() {
      assert.fail("an exact target tab must be reused");
    },
  };

  const page = await session.getPage("https://chatgpt.com/images/");

  assert.equal(page, target);
  assert.deepEqual(target.navigations, []);
});

test("CDP failure never falls back to launching a managed profile", async () => {
  let launchCalls = 0;
  const session = new BrowserSession(
    { cdpUrl: "http://127.0.0.1:9222" },
    {
      chromium: {
        async connectOverCDP() {
          throw new Error("connection refused");
        },
        async launchPersistentContext() {
          launchCalls += 1;
          assert.fail("CDP mode must not launch a managed Chrome profile");
        },
      },
    },
  );

  await assert.rejects(
    session.getContext(),
    (error) => error?.code === "CDP_UNREACHABLE",
  );
  assert.equal(launchCalls, 0);
  assert.equal(session.ownsContext, false);
});
