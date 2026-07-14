# Security

This tool controls a signed-in browser and therefore has the same practical access as the operator at that browser window.

- Prefer a dedicated Chrome profile. Attaching through CDP to a normal browsing instance is an explicit operator decision and grants this tool practical control of pages in that browser context.
- The managed Chrome process explicitly enables the Chromium sandbox and must not be launched with `--no-sandbox`.
- Never commit or share the profile directory. It contains session credentials.
- Keep the MCP transport local (`stdio`). Do not expose it as an unauthenticated remote service.
- Local source-image upload is disabled until `CHATGPT_IMAGE_ALLOWED_INPUT_DIRS` is configured. Use the narrowest possible roots.
- CDP is limited to loopback by default. Remote CDP exposes browser control and should be used only on a trusted private network with independent access controls.
- In CDP mode, an exact target tab may be reused; otherwise the tool opens a new tab and does not navigate unrelated operator tabs.
- Chrome 136 and newer ignore remote-debugging switches for the default Chrome data directory. Do not bypass this safeguard with profile copies, cookie extraction, or path tricks; use a non-default user-data directory or the managed dedicated-profile mode.
- The tool accepts only credential-free HTTPS `chatgpt.com` navigation targets.
- The local settings file contains only a project URL/name and optional character/style text. It is written with user-only permissions and never contains browser credentials.
- Project creation is idempotent by default. Creating another project requires an explicit `force_new` request.
- Generated files are created with user-only permissions where the platform supports them.

Report security issues privately to the repository owner instead of opening a public issue with session details, screenshots, local paths, or credentials.
