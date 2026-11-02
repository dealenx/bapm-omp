// packages/integration-omp/src/createOmpIntegration.ts
import { existsSync as existsSync2, mkdirSync as mkdirSync2, readFileSync as readFileSync2, statSync as statSync2, writeFileSync as writeFileSync2 } from "node:fs";
import { join as join2, resolve as resolve2 } from "node:path";

// packages/integration-api/src/helpers.ts
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync
} from "node:fs";
import { join, relative, resolve, sep, dirname, basename } from "node:path";
var SHARED_COMMAND_FRONTMATTER_KEYS = /* @__PURE__ */ new Set([
  "description",
  "allowed-tools",
  "model",
  "argument-hint",
  "input"
]);
function primitivesList(set) {
  if (Array.isArray(set)) return set;
  if (set && typeof set === "object" && Array.isArray(set.primitives)) {
    return set.primitives;
  }
  return [];
}
var KIND_MATCHERS = [
  { kind: "skill", test: /skill/ },
  { kind: "instruction", test: /instruction/ },
  { kind: "agent", test: /agent/ },
  { kind: "command", test: /command/ },
  { kind: "hook", test: /hook/ }
];
function resolvePrimitiveKind(type) {
  for (const { kind, test } of KIND_MATCHERS) {
    if (test.test(type)) return kind;
  }
  return void 0;
}
async function primitivesMaterialize(set, handlers) {
  for (const primitive of primitivesList(set)) {
    const type = String(primitive.type ?? "skill").toLowerCase();
    const name = sanitizeName(String(primitive.name));
    const ctx = { name, type };
    const kind = resolvePrimitiveKind(type);
    const handler = kind ? handlers[kind] : handlers.unknown;
    if (handler) await handler(primitive, ctx);
  }
}
function sanitizeName(name) {
  return String(name || "unnamed").replace(/[/\\]/g, "-");
}
function isUnderRoot(cwd, absPath, rootRel) {
  const rootAbs = resolve(cwd, rootRel);
  const rel = relative(rootAbs, absPath);
  return rel === "" || !rel.startsWith("..") && !rel.startsWith(`..${sep}`);
}
function assertUnderDeployRoots(cwd, absPath, deployRoots) {
  if (!deployRoots.some((r) => isUnderRoot(cwd, absPath, r))) {
    throw new Error(`materialize refuses path outside deploy roots: ${absPath}`);
  }
}
function readPrimitiveContent(p, preferredFile) {
  if (typeof p.content === "string") return p.content;
  const src = p.path ? resolve(p.path) : void 0;
  if (src && existsSync(src)) {
    if (preferredFile) {
      const nested = src.endsWith(preferredFile) ? src : join(src, preferredFile);
      if (existsSync(nested) && statSync(nested).isFile()) {
        return readFileSync(nested, "utf8");
      }
    }
    if (statSync(src).isFile()) return readFileSync(src, "utf8");
  }
  const name = sanitizeName(String(p.name));
  return `---
name: ${name}
---
# ${name}
`;
}
function toPosixRel(cwd, absPath) {
  return relative(cwd, absPath).split(sep).join("/");
}
function isWithin(root, candidate) {
  const rel = relative(root, candidate);
  return rel === "" || !rel.startsWith("..") && !rel.startsWith("/") && rel !== "..";
}
function listFiles(dir) {
  const files = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) files.push(...listFiles(path));
    else files.push(path);
  }
  return files;
}
function treeIsContained(directory, root, visited) {
  if (visited.has(directory)) return true;
  visited.add(directory);
  for (const entry of readdirSync(directory)) {
    const resolved = realpathSync(join(directory, entry));
    if (!isWithin(root, resolved)) return false;
    if (statSync(resolved).isDirectory() && !treeIsContained(resolved, root, visited)) return false;
  }
  return true;
}
function copyPortableSkillDirectory(sourceDir, pluginRoot, destDir) {
  const source = realpathSync(sourceDir);
  const root = typeof pluginRoot === "string" ? realpathSync(pluginRoot) : void 0;
  if (!root || !isWithin(root, source) || !statSync(source).isDirectory()) {
    throw new Error("Agent Plugin skill directory is outside its plugin root");
  }
  const skillFile = realpathSync(join(source, "SKILL.md"));
  if (!isWithin(root, skillFile) || !statSync(skillFile).isFile() || !treeIsContained(source, root, /* @__PURE__ */ new Set())) {
    throw new Error("Agent Plugin skill contains a path outside its plugin root");
  }
  mkdirSync(destDir, { recursive: true });
  cpSync(source, destDir, { recursive: true, dereference: true, force: true });
}
function materializeSkill(args) {
  const { primitive: p, cwd, deployRoots } = args;
  const destDir = resolve(cwd, args.destDir);
  const destFile = join(destDir, "SKILL.md");
  assertUnderDeployRoots(cwd, destFile, deployRoots);
  mkdirSync(destDir, { recursive: true });
  const src = p.path ? resolve(p.path) : void 0;
  if (p.format === "agent-plugin" && typeof p.skillDirectory === "string") {
    copyPortableSkillDirectory(p.skillDirectory, p.pluginRoot, destDir);
  } else if (src && existsSync(src)) {
    const skillMd = src.endsWith("SKILL.md") ? src : join(src, "SKILL.md");
    if (existsSync(skillMd) && statSync(skillMd).isFile()) {
      cpSync(skillMd, destFile);
    } else {
      writeFileSync(destFile, readPrimitiveContent(p, "SKILL.md"), "utf8");
    }
  } else {
    writeFileSync(destFile, readPrimitiveContent(p, "SKILL.md"), "utf8");
  }
  return listFiles(destDir).map((path) => ({
    path: toPosixRel(cwd, path),
    primitive: { name: String(p.name), packageName: p.packageName }
  }));
}
function writeDeployedFile(args) {
  const cwd = resolve(args.cwd);
  const destFile = resolve(cwd, args.destRel);
  assertUnderDeployRoots(cwd, destFile, args.deployRoots);
  mkdirSync(dirname(destFile), { recursive: true });
  writeFileSync(destFile, args.content);
  const row = { path: toPosixRel(cwd, destFile) };
  if (args.primitive) row.primitive = args.primitive;
  return row;
}
function defaultSectionHeading(p) {
  return `${p.name} (${p.type})`;
}
function renderPrimitivesMarkdown(args) {
  const filtered = args.filter ? args.primitives.filter(args.filter) : args.primitives;
  const sorted = [...filtered].sort((a, b) => {
    const type = String(a.type ?? "").localeCompare(String(b.type ?? ""));
    if (type !== 0) return type;
    const name = String(a.name ?? "").localeCompare(String(b.name ?? ""));
    return name !== 0 ? name : String(a.path ?? "").localeCompare(String(b.path ?? ""));
  });
  const emptyMessage = args.emptyMessage ?? "_No discoverable primitives._";
  const heading = args.sectionHeading ?? defaultSectionHeading;
  const sections = [args.title, "", "<!-- Generated by bapm compile. Do not edit by hand. -->", ""];
  if (sorted.length === 0) return [...sections, emptyMessage, ""].join("\n");
  for (const primitive of sorted) {
    sections.push(`## ${heading(primitive)}`, "");
    sections.push(
      readPrimitiveContent(primitive, args.preferredFile ?? `# ${primitive.name}
`).trimEnd(),
      ""
    );
  }
  return sections.join("\n");
}
function compileMarkdownReport(args) {
  const cwd = resolve(args.cwd);
  const outputPath = resolve(cwd, args.outputFile);
  const rel = relative(cwd, outputPath);
  const sepChar = process.platform === "win32" ? "\\" : "/";
  if (!rel || rel === ".." || rel.startsWith(`..${sepChar}`)) {
    throw new Error(args.outsideCwdMessage ?? "Compile output must be a cwd-relative file path");
  }
  if (args.requireBasename && basename(outputPath) !== args.requireBasename) {
    throw new Error(`Compile output basename must be ${args.requireBasename}`);
  }
  const path = rel.split(sep).join("/");
  const wrote = args.write;
  if (wrote) {
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, args.content, "utf8");
  }
  return { path, content: args.content, wrote };
}
function filterFrontmatterKeys(source, preserved) {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { content: source, droppedKeys: [] };
  const rawFm = match[1] ?? "";
  const body = match[2] ?? "";
  const kept = [];
  const droppedKeys = [];
  for (const line of rawFm.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const keyMatch = line.match(/^([A-Za-z0-9_-]+)\s*:/);
    if (!keyMatch) {
      kept.push(line);
      continue;
    }
    const key = keyMatch[1];
    if (preserved.has(key)) {
      kept.push(line);
    } else {
      droppedKeys.push(key);
    }
  }
  const fmBlock = kept.length > 0 ? `---
${kept.join("\n")}
---
` : "";
  return { content: `${fmBlock}${body}`.replace(/\s+$/, "\n"), droppedKeys };
}

// packages/integration-omp/src/createOmpIntegration.ts
var DEFAULT_DEPLOY_ROOTS = [".agents/skills", ".omp"];
var MCP_JSON_REL = ".omp/mcp.json";
function createOmpIntegration(options) {
  const id = options?.id ?? "omp";
  const deployRoots = [...options?.deployRoots ?? DEFAULT_DEPLOY_ROOTS];
  return {
    id,
    deployRoots,
    detect: ({ cwd }) => {
      const ompDir = join2(cwd, ".omp");
      return existsSync2(ompDir) && statSync2(ompDir).isDirectory();
    },
    getDeployRoots: () => [...deployRoots],
    async compile(primitives, context) {
      const content = renderPrimitivesMarkdown({
        primitives: primitivesList(primitives),
        title: "# AGENTS.md"
      });
      return compileMarkdownReport({
        cwd: context.cwd,
        outputFile: context.outputFile ?? "AGENTS.md",
        write: context.write,
        content,
        requireBasename: "AGENTS.md",
        outsideCwdMessage: "Omp compile output must be a cwd-relative file path"
      });
    },
    async materialize(primitives, ctx) {
      const cwd = resolve2(ctx?.cwd ?? process.cwd());
      const roots = ctx?.deployRoots?.length ? [...ctx.deployRoots] : deployRoots;
      if (!roots.some((r) => r === ".omp" || r.startsWith(".omp"))) {
        throw new Error("omp target missing .omp deploy root");
      }
      if (!roots.some((r) => r === ".agents/skills" || r.startsWith(".agents/skills"))) {
        throw new Error("omp target missing .agents/skills deploy root");
      }
      const deployedFiles = [];
      const diagnostics = [];
      await primitivesMaterialize(primitives, {
        skill(p, { name }) {
          deployedFiles.push(
            ...materializeSkill({
              primitive: p,
              cwd,
              deployRoots: roots,
              destDir: join2(".agents", "skills", name)
            })
          );
        },
        instruction(p, { name }) {
          diagnostics.push({
            code: "OMP_INSTRUCTION_SKIPPED",
            message: `Omp has no per-file rules directory; instruction "${name}" reaches omp through bapm compile \u2192 AGENTS.md`,
            primitive: String(p.name)
          });
        },
        agent(p) {
          diagnostics.push({
            code: "OMP_AGENT_UNSUPPORTED",
            message: `Omp does not receive agents from this target; ship "${p.name}" as a skill instead`,
            primitive: String(p.name)
          });
        },
        command(p, { name }) {
          const { content, droppedKeys } = filterFrontmatterKeys(
            readPrimitiveContent(p),
            SHARED_COMMAND_FRONTMATTER_KEYS
          );
          deployedFiles.push(
            writeDeployedFile({
              cwd,
              deployRoots: roots,
              destRel: join2(".omp", "prompts", `${name}.md`),
              content,
              primitive: { name: String(p.name), packageName: p.packageName }
            })
          );
          if (droppedKeys.length > 0) {
            diagnostics.push({
              code: "OMP_COMMAND_FRONTMATTER_DROPPED",
              message: `Dropped non-preserved command frontmatter keys for "${p.name}": ${droppedKeys.join(", ")}`,
              primitive: String(p.name),
              droppedKeys
            });
          }
        },
        hook(p) {
          diagnostics.push({
            code: "OMP_HOOK_UNSUPPORTED",
            message: `Omp hooks are config-owned and are not written by this target; hook "${p.name}" skipped`,
            primitive: String(p.name)
          });
        }
      });
      return {
        targetId: id,
        deployedFiles,
        ...diagnostics.length > 0 ? { diagnostics } : {}
      };
    },
    async configureMcp(servers, ctx) {
      return writeOmpMcpConfig(servers, {
        cwd: resolve2(ctx?.cwd ?? process.cwd()),
        deployRoots: ctx?.deployRoots?.length ? [...ctx.deployRoots] : deployRoots,
        targetId: ctx?.targetId ?? id
      });
    }
  };
}
var createIntegration = createOmpIntegration;
function writeOmpMcpConfig(servers, ctx) {
  const { cwd, deployRoots } = ctx;
  if (!deployRoots.some((r) => r === ".omp" || r.startsWith(".omp"))) {
    throw new Error("omp configureMcp requires a registered .omp deploy root");
  }
  const destFile = join2(cwd, ".omp", "mcp.json");
  assertUnderDeployRoots(cwd, destFile, deployRoots);
  mkdirSync2(join2(cwd, ".omp"), { recursive: true });
  const existing = readExistingMcpServers(destFile);
  const { entries: incoming, diagnostics } = normalizeServerEntries(servers);
  const next = { ...existing };
  const writtenNames = [];
  for (const [name, entry] of Object.entries(incoming)) {
    next[name] = entry;
    writtenNames.push(name);
  }
  const doc = { mcpServers: next };
  writeFileSync2(destFile, `${JSON.stringify(doc, null, 2)}
`, "utf8");
  return {
    targetId: ctx.targetId,
    configPath: MCP_JSON_REL,
    servers: writtenNames,
    deployedFiles: [{ path: MCP_JSON_REL }],
    diagnostics
  };
}
function readExistingMcpServers(path) {
  if (!existsSync2(path)) return {};
  try {
    const raw = JSON.parse(readFileSync2(path, "utf8"));
    return raw.mcpServers && typeof raw.mcpServers === "object" ? { ...raw.mcpServers } : {};
  } catch {
    return {};
  }
}
function normalizeServerEntries(servers) {
  const out = {};
  const diagnostics = [];
  const list = Array.isArray(servers) ? servers : Object.entries(servers).map(([name, value]) => ({
    ...value,
    name: value.name ?? name
  }));
  for (const server of list) {
    const name = String(server.name ?? "").trim();
    if (!name) continue;
    const entry = toOmpServerEntry(server);
    if (!entry) {
      diagnostics.push({
        code: "OMP_PORTABLE_MCP_UNSUPPORTED",
        message: `Omp cannot faithfully represent MCP server "${name}" (stdio needs command; http/sse needs url)`,
        server: name
      });
      continue;
    }
    out[name] = entry;
  }
  return { entries: out, diagnostics };
}
var ADAPTER_KEYS = {
  name: true,
  transport: true,
  type: true,
  command: true,
  args: true,
  url: true,
  env: true,
  cwd: true,
  packageName: true,
  registry: true,
  format: true
};
function toOmpServerEntry(server) {
  const transport = String(server.transport ?? server.type ?? "").toLowerCase();
  const entry = {};
  const portable = server.format === "agent-plugin";
  if (portable) {
    if (transport === "stdio") {
      if (typeof server.command !== "string") return void 0;
      entry.type = "stdio";
      entry.command = server.command;
      if (Array.isArray(server.args)) entry.args = server.args;
      if (typeof server.cwd === "string") entry.cwd = server.cwd;
      if (server.env && typeof server.env === "object") entry.env = server.env;
      return entry;
    }
    if (transport === "streamable-http" || transport === "http") {
      if (typeof server.url !== "string") return void 0;
      entry.type = "http";
      entry.url = server.url;
      return entry;
    }
    if (transport === "sse") {
      if (typeof server.url !== "string") return void 0;
      entry.type = "sse";
      entry.url = server.url;
      return entry;
    }
    return void 0;
  }
  if (typeof server.url === "string" && server.url) {
    entry.type = transport === "sse" ? "sse" : "http";
    entry.url = server.url;
  } else {
    if (typeof server.command !== "string") return void 0;
    entry.type = "stdio";
    entry.command = server.command;
    if (Array.isArray(server.args)) entry.args = server.args;
    if (typeof server.cwd === "string") entry.cwd = server.cwd;
    if (server.env && typeof server.env === "object") entry.env = server.env;
  }
  for (const [key, value] of Object.entries(server)) {
    if (ADAPTER_KEYS[key]) continue;
    if (value !== void 0) entry[key] = value;
  }
  return entry;
}
export {
  createIntegration,
  createOmpIntegration
};
