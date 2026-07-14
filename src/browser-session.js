import fs from "node:fs/promises";

import { chromium } from "playwright-core";

import { UserFacingError } from "./errors.js";

function isChatGPTPage(page) {
  try {
    const hostname = new URL(page.url()).hostname.toLowerCase();
    return hostname === "chatgpt.com" || hostname.endsWith(".chatgpt.com");
  } catch {
    return false;
  }
}

function isTargetPage(page, targetUrl) {
  try {
    return new URL(page.url()).href === new URL(targetUrl).href;
  } catch {
    return false;
  }
}

export function persistentContextOptions(config) {
  return {
    acceptDownloads: true,
    channel: config.chromeChannel,
    chromiumSandbox: true,
    headless: config.headless,
    viewport: { width: 1440, height: 1100 },
  };
}

export class BrowserSession {
  constructor(config, dependencies = {}) {
    this.config = config;
    this.chromium = dependencies.chromium || chromium;
    this.browser = null;
    this.context = null;
    this.ownsContext = false;
  }

  async getContext() {
    if (this.context) {
      return this.context;
    }
    try {
      if (this.config.cdpUrl) {
        this.browser = await this.chromium.connectOverCDP(this.config.cdpUrl);
        this.context = this.browser.contexts()[0];
        if (!this.context) {
          throw new UserFacingError(
            "The Chrome debugging endpoint has no browser context",
            "CDP_CONTEXT_MISSING",
          );
        }
        return this.context;
      }

      await fs.mkdir(this.config.chromeUserDataDir, { recursive: true, mode: 0o700 });
      this.context = await this.chromium.launchPersistentContext(
        this.config.chromeUserDataDir,
        persistentContextOptions(this.config),
      );
      this.ownsContext = true;
      return this.context;
    } catch (error) {
      if (error instanceof UserFacingError) {
        throw error;
      }
      if (this.config.cdpUrl) {
        throw new UserFacingError(
          "Could not connect to the configured Chrome debugging endpoint. Start Chrome with CDP enabled and retry.",
          "CDP_UNREACHABLE",
          { cause: error },
        );
      }
      throw new UserFacingError(
        "Could not open the dedicated Chrome session. Run `chatgpt-web-image login` locally.",
        "BROWSER_START_FAILED",
        { cause: error },
      );
    }
  }

  async getPage(targetUrl) {
    const context = await this.getContext();
    const pages = context.pages();
    const exactTarget = pages.find((page) => isTargetPage(page, targetUrl));
    // A CDP context belongs to the operator. Reuse only the exact requested
    // ChatGPT page; otherwise open a new tab so normal browsing is untouched.
    const page =
      exactTarget ||
      (this.config.cdpUrl
        ? await context.newPage()
        : pages.find(isChatGPTPage) || pages[0] || (await context.newPage()));
    if (page.url() !== targetUrl) {
      try {
        await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
      } catch (error) {
        throw new UserFacingError(
          "Could not open ChatGPT in Chrome. Check the browser network connection.",
          "CHATGPT_NAVIGATION_FAILED",
          { cause: error },
        );
      }
    }
    return page;
  }

  async close() {
    if (this.ownsContext && this.context) {
      await this.context.close().catch(() => {});
    }
    // A CDP connection belongs to the operator. Let process exit disconnect it
    // without closing the user's Chrome browser.
    this.context = null;
    this.browser = null;
    this.ownsContext = false;
  }
}
