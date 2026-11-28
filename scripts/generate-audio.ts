// Generates TTS audio for every line in every project (spec §7).
//
//   npm run audio          generate missing mp3s and rewrite audio/manifest.json
//   npm run audio:prune    same, then delete mp3s no line uses any more
//   npm run audio -- --dry-run   only report what would be generated
//
// Each file is named by a hash of model + voice + text (after the fixes in
// scripts/pronunciation.json), so editing a line or its pronunciation, or
// changing its voice produces a new file automatically. Voices are set in
// scripts/voices.json: "me" has one voice per variant (male / female; the
// app setting picks one, so my lines get a file for each), "speakers" maps
// speaker names, and "other_default" covers any speaker not listed there.
// The API key is read from ELEVEN_API_KEY in .env and never printed.
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Line } from '../src/scene.ts';
import { loadProjects } from './lib/projects.ts';
import { spoken } from './lib/pronunciation.ts';
import type { AudioManifest, LineAudio, ManifestLine, MyVoice } from '../src/audio.ts';

interface VoiceConfig {
  model: string;
  output_format: string;
  voices: Record<string, string>;
  me: Record<MyVoice, string>;
  other_default: string;
  speakers: Record<string, string>;
}

const root = join(import.meta.dirname, '..');
const audioDir = join(root, 'audio');
const manifestPath = join(audioDir, 'manifest.json');
const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const prune = args.has('--prune');

const config = JSON.parse(readFileSync(join(import.meta.dirname, 'voices.json'), 'utf8')) as VoiceConfig;

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

// --- Load and validate all projects ----------------------------------------
const loaded = loadProjects(root);
if (loaded.errors.length > 0) fail(`校验失败，先修好再生成音频：\n  - ${loaded.errors.join('\n  - ')}`);
const scenes = loaded.projects.flatMap((p) => p.scenes);

// --- Decide voice(s) and file name(s) for every line ----------------------
interface Clip { voice: string; text: string; file: string }
/** My lines: one clip per variant. Other lines: a single clip. */
type LinePlan = Clip | Record<MyVoice, Clip>;

const MY_VOICES = Object.keys(config.me) as MyVoice[];

/** `text` is the line as written; TTS gets it with scripts/pronunciation.json applied. */
function clip(voice: string, written: string): Clip {
  const text = spoken(written);
  const voiceId = config.voices[voice];
  if (!voiceId) fail(`scripts/voices.json 里没有声音 "${voice}"`);
  const hash = createHash('sha256').update(`${config.model}\n${voiceId}\n${text}`).digest('hex').slice(0, 16);
  return { voice, text, file: `${hash}.mp3` };
}

function clipsOf(p: LinePlan): Clip[] {
  return 'file' in p ? [p as Clip] : Object.values(p);
}

const unmapped = new Set<string>();
const plan: LinePlan[][] = scenes.map((scene) =>
  scene.lines.map((line: Line): LinePlan => {
    if (line.role === 'me') {
      return Object.fromEntries(MY_VOICES.map((v) => [v, clip(config.me[v], line.de)])) as Record<MyVoice, Clip>;
    }
    if (line.speaker && !config.speakers[line.speaker]) unmapped.add(line.speaker);
    return clip((line.speaker && config.speakers[line.speaker]) || config.other_default, line.de);
  }),
);
if (unmapped.size > 0) {
  console.warn(`提示：这些 speaker 没在 voices.json 里指定声音，用默认的 ${config.other_default}：${[...unmapped].join('、')}`);
}

const allClips = plan.flat().flatMap(clipsOf);
const todo = new Map<string, Clip>();
for (const c of allClips) {
  if (!existsSync(join(audioDir, c.file))) todo.set(c.file, c);
}

if (dryRun) {
  const chars = [...todo.values()].reduce((n, t) => n + t.text.length, 0);
  console.log(`需要生成 ${todo.size} 个音频，约 ${chars} 个字符`);
  for (const [file, t] of todo) console.log(`  ${file}  [${t.voice}] ${t.text}`);
  process.exit(0);
}

// --- Generate missing files -----------------------------------------------
async function synthesize(voice: string, text: string): Promise<Buffer> {
  const key = process.env.ELEVEN_API_KEY;
  if (!key) fail('.env 里没有 ELEVEN_API_KEY');
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${config.voices[voice]}?output_format=${config.output_format}`;
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, model_id: config.model, language_code: 'de' }),
    });
    if (res.ok) return Buffer.from(await res.arrayBuffer());
    const body = (await res.text()).slice(0, 300);
    if ((res.status === 429 || res.status >= 500) && attempt < 4) {
      console.warn(`  ${res.status}，${attempt * 2} 秒后重试`);
      await new Promise((r) => setTimeout(r, attempt * 2000));
      continue;
    }
    fail(`ElevenLabs 返回 ${res.status}：${body}`);
  }
}

if (existsSync(join(root, '.env'))) process.loadEnvFile(join(root, '.env'));
let done = 0;
for (const [file, { voice, text }] of todo) {
  writeFileSync(join(audioDir, file), await synthesize(voice, text));
  console.log(`  [${++done}/${todo.size}] ${file}  [${voice}] ${text}`);
}

// --- Durations and manifest -----------------------------------------------
// Duration of a constant-bitrate mp3: skip the ID3v2 tag, then bytes / (bitrate / 8).
function mp3Duration(buf: Buffer): number {
  let offset = 0;
  if (buf.subarray(0, 3).toString('latin1') === 'ID3') {
    offset = 10 + (((buf[6] & 0x7f) << 21) | ((buf[7] & 0x7f) << 14) | ((buf[8] & 0x7f) << 7) | (buf[9] & 0x7f));
  }
  const kbps = Number(config.output_format.split('_')[2]);
  if (!kbps) fail(`无法从 output_format "${config.output_format}" 读出码率`);
  return Math.round(((buf.length - offset) * 8) / (kbps * 1000) * 10) / 10;
}

function audioOf({ file }: Clip): LineAudio {
  return { file, duration: mp3Duration(readFileSync(join(audioDir, file))) };
}

const manifest: AudioManifest = {};
scenes.forEach((scene, i) => {
  manifest[scene.id] = plan[i].map((p): ManifestLine =>
    'file' in p
      ? audioOf(p as Clip)
      : (Object.fromEntries(MY_VOICES.map((v) => [v, audioOf(p[v])])) as Record<MyVoice, LineAudio>),
  );
});
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');

// --- Optional cleanup -----------------------------------------------------
const used = new Set(allClips.map((c) => c.file));
const orphans = readdirSync(audioDir).filter((f) => f.endsWith('.mp3') && !used.has(f));
if (prune) {
  for (const f of orphans) unlinkSync(join(audioDir, f));
  if (orphans.length > 0) console.log(`已删除 ${orphans.length} 个不再使用的音频`);
} else if (orphans.length > 0) {
  console.log(`有 ${orphans.length} 个音频不再使用，运行 npm run audio:prune 删除`);
}

console.log(`完成：新生成 ${todo.size} 个，共 ${used.size} 个音频，manifest 已更新`);
