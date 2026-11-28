# Sprechprobe

德语语音对台词训练器。规格见 [german-speaking-trainer-spec.md](german-speaking-trainer-spec.md)。

## 目录

```
projects/<项目id>/project.json   项目标题、简介、在项目库里的顺序（order）
projects/<项目id>/scenes/        剧本 JSON，一个场景一个文件，文件名 = 场景 id.json
drafts/<项目id>/                 待审的场景草稿（打包和音频脚本不读，审定后移到 projects/）
docs/scene-plan.md               场景规划：各领域计划写哪些场景、进度
docs/phrase-index.md             句库索引（npm run index 生成，不提交）
STYLE.md                         场景写作规范和审稿清单
audio/                           TTS 生成的 mp3，所有项目共用（脚本生成，勿手改）
scripts/                         校验、TTS、图标脚本（Node 直接运行 .ts）
src/                             应用代码（Vite + TypeScript，无框架）
```

- 项目 id（文件夹名）和场景 id 都只用小写字母、数字、连字符。
- 场景 id 在**所有项目里**都不能重复：手机上的学习进度按场景 id 记录。
- 新建项目：建 `projects/<id>/project.json` 和 `scenes/` 文件夹即可。
- 写新场景：在 Claude Code 里运行 `/new-scenes <领域>`（如 `/new-scenes 购物`），流程见 `.claude/commands/new-scenes.md`。
- 缩写（如 VWL）TTS 可能按英语字母读：在 `scripts/pronunciation.json` 里写德语读法（`"VWL": "Fau-We-El"`），只影响音频，界面照旧显示原文。校验会对没写读法的全大写缩写给警告。
- 我说的台词在全库里不能重复（校验报错）；场景太长、句子太长、台词太像只给警告，不影响打包。

## 命令

```
npm install          安装依赖
npm run dev          本地开发服务器
npm run validate     校验所有项目和场景（加 -- --with-drafts 时连草稿一起查）
npm run index        生成句库索引 docs/phrase-index.md（加 -- --with-drafts 时含草稿）
npm run audio        为新台词生成 TTS 音频（ElevenLabs，声音见 scripts/voices.json）
npm run audio:prune  同上，并删除不再使用的音频
npm run build        校验 + 类型检查 + 打包到 dist/（含 content/ 和离线用的 sw.js）
npm run preview      本地预览打包结果（路径同线上 /Sprechprobe/）
```

## 内容怎么到手机上

打包时生成 `dist/content/`：`catalog.json`（项目列表）、`projects/<id>.json`（每个项目的场景和音频对应表）、`audio/`（mp3）。
手机在项目库里"添加"项目时才下载它的剧本和全部音频；之后只有点"同步"才联网更新。
应用代码本身由 service worker 离线缓存，同步时一并检查新版本。

## 部署

推送到 main 后，GitHub Actions 自动打包并发布到 GitHub Pages：
https://zhengnetlab.github.io/Sprechprobe/

TTS 不在线上运行：新台词先在本地 `npm run audio`，把生成的 mp3 一起提交（缺音频时打包会失败）。
应用图标由 `node scripts/make-icons.ts` 生成到 public/icons/。
