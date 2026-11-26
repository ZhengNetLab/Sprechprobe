---
description: 为一个领域写一批新场景（列清单 → 草稿 → 检查 → 审稿 → 终审 → 入库）
argument-hint: <领域，如 购物>
---

为领域「$ARGUMENTS」写一批新场景。严格按下面的步骤做，标了**停下**的地方必须等我回复。

## 1. 列清单

- 读 `STYLE.md` 和 `docs/scene-plan.md`，运行 `npm run index -- --with-drafts`，读 `docs/phrase-index.md`。
- 从规划里取这个领域状态为"计划"的场景，一批 5–10 个，列一张表：id、title、focus_zh、拟定的我的台词要点。
- 标出可能和已有台词重复或相似的地方；需要我提供信息的地方（比如面试场景里背景没写到的经历）列成问题。
- **停下，等我确认清单。**

## 2. 写草稿

- 按 `STYLE.md` 写场景 JSON，放进 `drafts/<项目id>/<场景id>.json`（项目见 `docs/scene-plan.md` 里每个领域标的项目）。
- 新的女性角色在 `scripts/voices.json` 的 `speakers` 里配 Sarah；男性角色不用配。
- 把 `docs/scene-plan.md` 里这些场景的状态改成"草稿"。

## 3. 自动检查

- 运行 `npm run validate -- --with-drafts`。有错误就改到没有为止。
- 警告逐条说明：保留（为什么）还是已修改。

## 4. 独立审稿

- 开一个子代理审稿。只给它 `STYLE.md`、这批草稿的路径和 `docs/phrase-index.md`（先 `npm run index -- --with-drafts` 重新生成），不给写作过程。让它按 `STYLE.md` 的审稿清单逐个场景检查，返回问题清单。
- 根据审稿结果修改，列出：改了什么、哪些建议没采纳以及原因。改完再跑一次第 3 步。

## 5. 给我终审

- 每个场景展示：标题、中文情境、focus、逐句台词（对方台词 / 我的台词 + 中文提示）。
- **停下，等我逐个通过或提出修改。** 改完再给我看改过的场景。

## 6. 入库

- 把通过的草稿移到 `projects/<项目id>/scenes/`（项目不存在就先建 `project.json`）。
- 运行 `npm run audio` 生成音频，`npm run build` 确认通过。
- 把 `docs/scene-plan.md` 里的状态改成"已入库"。
- commit（包括生成的 mp3）。**不要 push。** 提醒我用 `npm run dev` 试听；我听完明确说 push 才 push（push 会自动部署）。

以后发现某个场景有问题（说法不对、总是练不会），修改也走第 2–6 步。
