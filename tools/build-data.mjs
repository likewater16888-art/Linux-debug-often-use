/**
 * 从 source/工控Linux部署调试速查表.md 生成 assets/data.js
 * 用法：node tools/build-data.mjs
 *
 * 设计：Markdown 原文是唯一内容源，前端在运行时解析为章节 / 命令 / 表格，
 * 因此新增内容只需改 Markdown，再执行一次本脚本即可。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const srcPath = resolve(root, 'source', '工控Linux部署调试速查表.md');
const outPath = resolve(root, 'assets', 'data.js');

const markdown = readFileSync(srcPath, 'utf8').replace(/\r\n/g, '\n').trimEnd() + '\n';
const title = (markdown.match(/^#\s+(.+)$/m) || [, '工控 Linux 部署调试速查表'])[1].trim();
const today = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit'
}).format(new Date());

const payload = {
  meta: {
    title,
    subtitle: 'Ubuntu / Debian · 工业相机 / 采集卡 / 串口 / NVIDIA / 驱动与内核',
    version: 'v1.0',
    updated: today,
    site: 'https://likewater16888-art.github.io/Linux-debug-often-use/',
    repo: 'https://github.com/likewater16888-art/Linux-debug-often-use',
    source: 'source/工控Linux部署调试速查表.md'
  },
  markdown
};

const banner = `/* 由 tools/build-data.mjs 自动生成，请勿直接修改；内容源：source/工控Linux部署调试速查表.md */\n`;
writeFileSync(outPath, banner + 'window.LINUX_KB = ' + JSON.stringify(payload, null, 2) + ';\n', 'utf8');

const lines = markdown.split('\n').length;
const sections = (markdown.match(/^##\s+/gm) || []).length;
console.log(`data.js 已生成：${outPath}`);
console.log(`Markdown：${lines} 行 / ${Buffer.byteLength(markdown, 'utf8')} 字节；二级章节 ${sections} 个`);
