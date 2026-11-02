# bapm-integration-omp

Интеграция [Omp](https://omp.sh) для [bapm](https://github.com/Sdju/bapm) как **отдельный git-пакет** — грузится прямо из этого репозитория, без npm.

> ⚠️ Это **не** npm-пакет `@b-apm/integration-omp` из монорепо bapm (`Sdju/bapm/packages/integration-omp`). Это независимая копия-источник для git-загрузки: `package.json` называется `bapm-integration-omp`, scope `@b-apm/` здесь намеренно не используется. Функционально идентична каноническому таргету omp.

## Использование

Одной командой (id `omp` выводится из имени репо `bapm-omp`):

```bash
bunx github:dealenx/bapm install --target github:dealenx/bapm-omp
```

Или постоянно в `bapm.yml`:

```yml
targets:
  omp: github:dealenx/bapm-omp
active:
  target: omp
```

Клон кэшируется в `~/.bapm/integrations-git/` (переиспользуется между запусками; переопределяется `BAPM_CONFIG_DIR`).

## Что делает

| Артефакт bapm | Куда уходит |
| --- | --- |
| skills | `.agents/skills/<name>/SKILL.md` |
| commands | `.omp/prompts/<name>.md` |
| MCP | `.omp/mcp.json` (`mcpServers`; sse поддерживается) |
| instructions / agents / hooks | skip → диагностика (`bapm compile` → `AGENTS.md`) |
| compile | `AGENTS.md` (корень) |

Detect: каталог `.omp/`.

## Требования к пакету из git

- `package.json` с `exports["."]` (или `main`);
- entry **уже собран** (`dist/index.mjs`) либо есть `prepare`/`build` скрипт — тогда bapm сам выполнит `bun install --production` + сборку после клона;
- экспорт `createIntegration()` (или default) → runtime `BapmIntegration` с `id`, `deployRoots`, `detect`, `materialize`;
- `id` внутри пакета должен совпадать с id из `targets`/`--target` (для `github:owner/bapm-X` — `X`, для `github:owner/name` — `name`).

Исходники: `src/`, собранный бандл (без внешних зависимостей, только node-библиотеки): `dist/index.mjs`.

```bash
# пересборка (из монорепо bapm):
node_modules/.bin/esbuild packages/integration-omp/src/index.ts --bundle --format=esm \
  --platform=node --target=node22 \
  --alias:@b-apm/integration-api=./packages/integration-api/src/index.ts \
  --outfile=dist/index.mjs
```

## Ссылки

- Omp skills: <https://omp.sh/docs/skills>
- Omp MCP: <https://omp.sh/docs/mcp>
- Omp prompt templates: <https://omp.sh/docs/prompt-templates>
- Omp context files: <https://omp.sh/docs/context-files>
