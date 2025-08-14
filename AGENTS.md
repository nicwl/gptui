## Maestro (iOS) + MCP setup

- Install Maestro CLI: `curl -Ls "https://get.maestro.mobile.dev" | bash`
- For iOS simulators, install idb-companion: `brew tap facebook/fb && brew install facebook/fb/idb-companion`
- Sample flow lives at `maestro/flows/ios_smoke.yaml`
- Run the flow: `npm run maestro:test:ios`
- Start MCP server (for AI control via MCP): `npm run maestro:mcp`

## LLM automation: how to start, navigate, and send a message (iOS)

- Bundle ID: `org.reactjs.native.example.gptui`
- Workspace: `/Users/nic/code/gptui`
- Stable selectors:
  - IDs: `menuButton`, `settingsButton`
  - Text: `Welcome to GPT Chat`, `Type a message...`, `Send`, `Open Menu`, `Settings`, `OpenAI API Key`

Constraints (Settings screen only):
- Do not type or tap any controls that modify settings (no “Save”, “Remove”, “Clear All”, “Show/Hide”, “Edit”). Navigating to Settings for visibility checks and navigating back is OK.

Start simulator and launch app:
- List devices: `mcp_maestro_list_devices`
- Start iOS simulator: `mcp_maestro_start_device` with `{ platform: "ios" }`
- Launch app: `mcp_maestro_launch_app` with `{ appId: "org.reactjs.native.example.gptui" }`

Read-only navigation to Settings:
```yaml
appId: org.reactjs.native.example.gptui
---
- launchApp:
    clearState: false
- tapOn:
    id: menuButton
- waitForAnimationToEnd
- tapOn:
    id: settingsButton
- assertVisible: "OpenAI API Key"
- back
```

Send a message (uses real API key stored on device):
```yaml
appId: org.reactjs.native.example.gptui
---
- launchApp:
    clearState: false
- tapOn: "Type a message..."
- inputText: "Say only: ACK"
- tapOn: "Send"
- assertVisible: "ACK"
```

Quick commands:
- IDs smoke flow: `npm run maestro:test:ios:ids`
- Text smoke flow: `npm run maestro:test:ios`
- Send message flow: `npm run maestro:test:ios:send`

Add to your MCP client config (e.g., Cursor/Claude Desktop) to enable the server:

```json
{
  "mcpServers": {
    "maestro": {
      "command": "maestro",
      "args": ["mcp"]
    }
  }
}
```