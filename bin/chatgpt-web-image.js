#!/usr/bin/env node
import path from "node:path";

import { loadConfig } from "../src/config.js";
import { parseCliArgs } from "../src/cli-args.js";
import { safeError, UserFacingError } from "../src/errors.js";
import { ImageGenerator } from "../src/generator.js";

const HELP = `chatgpt-web-image

Usage:
  chatgpt-web-image login
  chatgpt-web-image check
  chatgpt-web-image setup-project --project-name "ChatGPT Web Image MCP"
  chatgpt-web-image generate --prompt "Create a watercolor mountain landscape"
  chatgpt-web-image generate --surface images --prompt "Create a product photo"
  chatgpt-web-image generate --character "same woman, black bob haircut" --style "cinematic ink painting" --prompt "Walking beside a lake"
  chatgpt-web-image generate --prompt "Edit this image" --source /allowed/input.png

Options:
  -p, --prompt TEXT       Image prompt
  -s, --source PATH       Source image; repeatable
      --chatgpt-url URL   HTTPS chatgpt.com conversation or project URL
      --surface MODE      chat (default) or images
      --character TEXT    Character consistency profile; empty disables the configured default
      --style TEXT        Visual style consistency profile; empty disables the configured default
      --no-consistency    Disable both configured consistency profiles for this call
      --project-name TEXT Fixed ChatGPT project name for setup-project
      --project-url URL   Adopt and configure an existing ChatGPT project URL
      --force-new         Create a new project even when a fixed URL is already configured
      --output-dir PATH   Override the output directory for this CLI run
  -h, --help              Show this help
`;

async function runLogin(generator, args, config) {
  process.stderr.write(
    config.cdpUrl
      ? "Connected to the configured Chrome CDP endpoint. Sign in to ChatGPT in that browser; this command will continue when the prompt box is ready.\n"
      : "A dedicated Chrome profile is open. Sign in to ChatGPT in that window; this command will continue when the prompt box is ready.\n",
  );
  const status = await generator.login({
    chatgpt_url: args.chatgpt_url || undefined,
    surface: args.surface || undefined,
  });
  process.stdout.write(`${JSON.stringify({ ok: true, ...status }, null, 2)}\n`);
}

async function main() {
  const args = parseCliArgs(process.argv.slice(2));
  if (args.command === "help") {
    process.stdout.write(HELP);
    return;
  }
  const env = { ...process.env };
  if (args.output_dir) {
    env.CHATGPT_IMAGE_OUTPUT_DIR = path.resolve(args.output_dir);
  }
  const config = loadConfig(env);
  const generator = new ImageGenerator(config);
  try {
    if (args.command === "login") {
      await runLogin(generator, args, config);
      return;
    }
    if (args.command === "check") {
      process.stdout.write(
        `${JSON.stringify(
          await generator.check({
            chatgpt_url: args.chatgpt_url || undefined,
            surface: args.surface || undefined,
          }),
          null,
          2,
        )}\n`,
      );
      return;
    }
    if (args.command === "setup-project") {
      const result = await generator.setupProject({
        project_name: args.project_name || undefined,
        project_url: args.project_url || undefined,
        force_new: args.force_new,
        ...(args.character_profile !== undefined
          ? { character_profile: args.character_profile }
          : {}),
        ...(args.style_profile !== undefined ? { style_profile: args.style_profile } : {}),
      });
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return;
    }
    if (args.command === "generate") {
      const result = await generator.generate({
        prompt: args.prompt,
        source_images: args.source_images,
        chatgpt_url: args.chatgpt_url || undefined,
        surface: args.surface || undefined,
        ...(args.character_profile !== undefined
          ? { character_profile: args.character_profile }
          : {}),
        ...(args.style_profile !== undefined ? { style_profile: args.style_profile } : {}),
        ...(args.use_consistency !== undefined
          ? { use_consistency: args.use_consistency }
          : {}),
      });
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return;
    }
    throw new UserFacingError(`Unknown command: ${args.command}`, "INVALID_ARGUMENT");
  } finally {
    await generator.close();
  }
}

main().catch((error) => {
  const safe = safeError(error);
  process.stderr.write(`${safe.code}: ${safe.message}\n`);
  process.exitCode = 1;
});
