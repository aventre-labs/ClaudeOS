import { build } from "esbuild";

const shared = {
  bundle: true,
  platform: "node",
  format: "cjs",
  external: ["vscode"],
};

// Extension entry
await build({
  ...shared,
  entryPoints: ["src/extension.ts"],
  outfile: "out/extension.js",
});

// MCP server entry (no vscode external needed)
await build({
  ...shared,
  entryPoints: ["mcp-server/src/index.ts"],
  outfile: "out/mcp-server.js",
  external: [],
});
