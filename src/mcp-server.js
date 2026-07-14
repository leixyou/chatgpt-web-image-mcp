#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { loadConfig } from "./config.js";
import { safeError } from "./errors.js";
import { ImageGenerator } from "./generator.js";
import { toMcpContent } from "./mcp-result.js";

export function createServer(config = loadConfig(), dependencies = {}) {
  const generator = dependencies.generator || new ImageGenerator(config);
  const server = new McpServer({ name: "chatgpt-web-image", version: "0.3.0" });

  server.registerTool(
    "check_chatgpt_image_browser",
    {
      title: "Check ChatGPT image browser",
      description:
        "Check whether the configured local Chrome session (CDP attachment or managed profile) is signed in and ready.",
      inputSchema: {
        surface: z.enum(["chat", "images"]).optional().describe("ChatGPT web surface to check"),
        chatgpt_url: z
          .string()
          .url()
          .optional()
          .describe("Optional HTTPS chatgpt.com URL override"),
      },
    },
    async (input) => {
      try {
        const status = await generator.check(input);
        return { content: [{ type: "text", text: JSON.stringify(status, null, 2) }] };
      } catch (error) {
        const safe = safeError(error);
        return { isError: true, content: [{ type: "text", text: JSON.stringify(safe) }] };
      }
    },
  );

  server.registerTool(
    "setup_chatgpt_image_project",
    {
      title: "Set up the fixed ChatGPT image project",
      description:
        "Create or reconfigure one fixed ChatGPT project for image generation, save its URL locally, and set default character/style consistency profiles. Reuses the saved project unless force_new is true.",
      inputSchema: {
        project_name: z.string().min(1).max(80).optional(),
        project_url: z
          .string()
          .url()
          .optional()
          .describe("Optional existing ChatGPT project home URL to adopt"),
        character_profile: z
          .string()
          .max(4000)
          .optional()
          .describe("Default reusable character identity description"),
        style_profile: z
          .string()
          .max(4000)
          .optional()
          .describe("Default reusable visual style description"),
        force_new: z
          .boolean()
          .optional()
          .describe("Create another project instead of reusing the configured URL"),
      },
    },
    async (input) => {
      try {
        const result = await generator.setupProject(input);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        const safe = safeError(error);
        return { isError: true, content: [{ type: "text", text: JSON.stringify(safe) }] };
      }
    },
  );

  server.registerTool(
    "generate_chatgpt_web_image",
    {
      title: "Generate image in ChatGPT web",
      description:
        "Use the operator's configured, logged-in local ChatGPT web session to generate an image and return the captured image content. Calls are serialized.",
      inputSchema: {
        prompt: z.string().min(1).max(12000).describe("Image generation or editing prompt"),
        source_images: z
          .array(z.string())
          .max(8)
          .optional()
          .describe("Optional local image paths under CHATGPT_IMAGE_ALLOWED_INPUT_DIRS"),
        chatgpt_url: z
          .string()
          .url()
          .optional()
          .describe("Optional HTTPS chatgpt.com conversation or project URL"),
        surface: z
          .enum(["chat", "images"])
          .optional()
          .describe("Use the regular chat/project composer or the dedicated Images composer"),
        character_profile: z
          .string()
          .max(4000)
          .optional()
          .describe("Character identity constraints; omitted uses the configured default"),
        style_profile: z
          .string()
          .max(4000)
          .optional()
          .describe("Visual style constraints; omitted uses the configured default"),
        use_consistency: z
          .boolean()
          .optional()
          .describe("Set false to ignore both configured consistency profiles for this call"),
      },
    },
    async (input) => {
      try {
        const result = await generator.generate(input);
        return { content: await toMcpContent(result, config.maxImageBytes) };
      } catch (error) {
        const safe = safeError(error);
        return { isError: true, content: [{ type: "text", text: JSON.stringify(safe) }] };
      }
    },
  );

  return { server, generator };
}

export async function main() {
  const { server, generator } = createServer();
  const shutdown = async () => {
    await generator.close();
    process.exit(0);
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
  await server.connect(new StdioServerTransport());
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    const safe = safeError(error);
    process.stderr.write(`${safe.code}: ${safe.message}\n`);
    process.exitCode = 1;
  });
}
