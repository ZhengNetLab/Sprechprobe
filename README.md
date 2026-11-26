# Sprechprobe

德语语音对台词训练器。规格见 [german-speaking-trainer-spec.md](german-speaking-trainer-spec.md)。

## 目录

```
scenes/    剧本 JSON，一个场景一个文件，文件名 = id.json
audio/     TTS 生成的 mp3（脚本生成，勿手改）
scripts/   校验与 TTS 脚本（Node 直接运行 .ts）
src/       应用代码（Vite + TypeScript，无框架）
```

## 命令

```
npm install        安装依赖
npm run dev        本地开发服务器
npm run validate   校验 scenes/ 下所有场景
npm run audio      为新台词生成 TTS 音频（ElevenLabs，声音见 scripts/voices.json）
npm run audio:prune  同上，并删除不再使用的音频
npm run build      校验 + 类型检查 + 打包到 dist/（含离线用的 sw.js）
npm run preview    本地预览打包结果（路径同线上 /Sprechprobe/）
```

## 部署

推送到 main 后，GitHub Actions 自动打包并发布到 GitHub Pages：
https://zhengnetlab.github.io/Sprechprobe/

TTS 不在线上运行：新台词先在本地 `npm run audio`，把生成的 mp3 一起提交。
应用图标由 `node scripts/make-icons.ts` 生成到 public/icons/。
