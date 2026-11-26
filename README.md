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
npm run build      校验 + 类型检查 + 打包到 dist/
```
