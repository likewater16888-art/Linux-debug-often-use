/* ============================================================
   工控 Linux 部署调试速查表 · 智能指令库 — 应用层
   ① 工具 / 本地存储  ② Markdown 解析  ③ 数据建模
   ④ 视图渲染  ⑤ 检索面板  ⑥ 路由 / 事件 / 初始化
   ============================================================ */
(function () {
  'use strict';

  const KB_DATA = window.LINUX_KB;
  if (!KB_DATA || !KB_DATA.markdown) {
    document.body.innerHTML = '<div style="padding:48px;font-family:system-ui;color:#eee;background:#0b1218">' +
      '<h1>数据加载失败</h1><p>请确认 <code>assets/data.js</code> 已生成：<br>' +
      '<code>node tools/build-data.mjs</code></p></div>';
    return;
  }

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const esc = (value) => String(value == null ? '' : value).replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));

  function stripMd(value) {
    return String(value || '')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/\s+/g, ' ')
      .trim();
  }
  const normalizeCmd = (cmd) => String(cmd || '').toLowerCase().replace(/\s+/g, ' ').trim();
  const truncate = (text, n) => {
    const s = String(text || '');
    return s.length > n ? s.slice(0, n - 1) + '…' : s;
  };
  function debounce(fn, wait) {
    let timer;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), wait);
    };
  }
  const storage = {
    get(key, fallback) {
      try {
        const raw = localStorage.getItem('linuxkb.' + key);
        return raw == null ? fallback : JSON.parse(raw);
      } catch (err) { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem('linuxkb.' + key, JSON.stringify(value)); } catch (err) { /* 忽略 */ }
    }
  };

  /* ---------------- Markdown 代码块拆分 ---------------- */
  function splitCode(code) {
    const lines = code.split('\n');
    const first = (lines.find((l) => l.trim()) || '').trim();
    const last = (lines.filter((l) => l.trim()).pop() || '').trim();
    const isScript = /^#!/.test(first) || /^(for|while|until|if)\b/.test(first) ||
      /^(for|while|until)\b.*\bdo\b/.test(first) || /\bdone$/.test(last);
    if (isScript) return [{ cmd: code.trim(), desc: '', script: true }];

    const items = [];
    let comments = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].replace(/\s+$/, '');
      const trimmed = line.trim();
      if (!trimmed) continue;
      if (trimmed.startsWith('#')) {
        comments.push(trimmed.replace(/^#+\s?/, ''));
        continue;
      }
      let cmd = trimmed;
      while (cmd.endsWith('\\') && i + 1 < lines.length) {
        const next = lines[++i].replace(/\s+$/, '').trim();
        if (!next) continue;
        cmd += '\n' + next;
      }
      items.push({ cmd, desc: comments.join(' · '), script: false });
      comments = [];
    }
    if (!items.length && code.trim()) items.push({ cmd: code.trim(), desc: comments.join(' · '), script: false });
    return items;
  }

  /* ---------------- Markdown 解析 ---------------- */
  function parseDoc(markdown) {
    const lines = markdown.split('\n');
    const doc = { title: '', intro: [], parts: [], usage: [], quickRows: [] };
    let part = null;
    let section = null;
    let subTitle = null;
    let idx = 0;
    const counters = { daily: 0, full: 0, safety: 0, misc: 0 };

    const targetBlocks = () => (section ? section.blocks : part ? part.blocks : doc.intro);
    const push = (block) => targetBlocks().push(block);
    const ownerId = () => (section ? section.id : part ? part.id : 'intro');
    const blockId = (kind) => `${ownerId()}-${kind}${targetBlocks().length + 1}`;

    function newPart(name, id, num, icon, color) {
      part = { id, name, num, icon, color, tagline: '', blocks: [], sections: [], special: id === 'index' };
      doc.parts.push(part);
      section = null;
      subTitle = null;
    }
    function newSection(rawTitle) {
      counters[part.id] = (counters[part.id] || 0) + 1;
      const n = counters[part.id];
      const title = rawTitle.replace(/^[一二三四五六七八九十百]+、\s*/, '').trim();
      section = {
        id: `${part.id}-${String(n).padStart(2, '0')}`,
        no: String(n).padStart(2, '0'),
        title,
        partId: part.id,
        partName: part.name,
        partNum: part.num,
        partColor: part.color,
        blocks: [],
        h3s: [],
        commands: []
      };
      part.sections.push(section);
      subTitle = null;
    }
    function addParagraph(text) {
      const blocks = targetBlocks();
      const last = blocks[blocks.length - 1];
      if (last && last.type === 'p') last.text += ' ' + text;
      else blocks.push({ type: 'p', text });
    }
    const isSpecial = (t) =>
      /^#{1,3}\s/.test(t) || t.startsWith('```') || t.startsWith('|') ||
      t.startsWith('>') || t === '---' || /^[-*]\s+/.test(t) || /^\d+\.\s+/.test(t);

    while (idx < lines.length) {
      const t = lines[idx].trim();
      if (!t) { idx++; continue; }

      // 代码块
      if (t.startsWith('```')) {
        const lang = t.slice(3).trim();
        idx++;
        const codeLines = [];
        while (idx < lines.length && !lines[idx].trim().startsWith('```')) {
          codeLines.push(lines[idx]);
          idx++;
        }
        idx++;
        let caption = null;
        const blocks = targetBlocks();
        const last = blocks[blocks.length - 1];
        if (last && last.type === 'p') {
          const plain = stripMd(last.text);
          const endsSentence = /[。！？]$/.test(plain);
          const endsColon = /[：:]$/.test(plain);
          if (plain.length <= 26 && !endsColon && (plain.length <= 14 || !endsSentence)) {
            caption = plain;
            blocks.pop();
          }
        }
        const code = codeLines.join('\n').replace(/\s+$/, '');
        blocks.push({
          type: 'code',
          id: blockId('b'),
          lang: lang || 'bash',
          code,
          caption: caption || subTitle || (section ? section.title : part ? part.name : '命令'),
          items: splitCode(code)
        });
        continue;
      }

      // 标题
      if (/^#{1,3}\s/.test(t)) {
        const level = (t.match(/^#+/) || ['#'])[0].length;
        const text = t.replace(/^#+\s*/, '').trim();
        if (level === 1) {
          if (!doc.title) doc.title = text;
          else if (/^第一部分/.test(text)) newPart(text.split('｜')[1] || text, 'daily', 'Ⅰ', '🧰', 'var(--accent)');
          else if (/^第二部分/.test(text)) newPart(text.split('｜')[1] || text, 'full', 'Ⅱ', '📚', 'var(--accent-2)');
          else if (text === '安全与规范') newPart(text, 'safety', 'Ⅲ', '🛡️', 'var(--amber)');
          else if (text === '快速索引') newPart(text, 'index', 'SOS', '🚨', 'var(--danger)');
          else newPart(text, 'part-' + (doc.parts.length + 1), 'Ⅳ', '📦', 'var(--purple)');
        } else if (level === 2) {
          if (!part) newPart('未分组', 'misc', '·', '📦', 'var(--purple)');
          newSection(text);
        } else if (section) {
          const heading = { type: 'h3', text, id: `${section.id}-h${section.h3s.length + 1}` };
          section.blocks.push(heading);
          section.h3s.push(heading);
          subTitle = text;
        }
        idx++;
        continue;
      }

      // 表格
      if (t.startsWith('|')) {
        const rawRows = [];
        while (idx < lines.length && lines[idx].trim().startsWith('|')) {
          rawRows.push(lines[idx].trim());
          idx++;
        }
        const rows = rawRows
          .map((r) => r.replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim()))
          .filter((r) => !r.every((c) => /^:?-{2,}:?$/.test(c)));
        if (!rows.length) continue;
        const head = rows.shift();
        push({ type: 'table', id: blockId('t'), head, rows, rowIds: [] });
        continue;
      }

      // 引用
      if (t.startsWith('>')) {
        const qLines = [];
        while (idx < lines.length && lines[idx].trim().startsWith('>')) {
          qLines.push(lines[idx].trim().replace(/^>\s?/, ''));
          idx++;
        }
        push({ type: 'quote', lines: qLines });
        continue;
      }

      if (t === '---') { idx++; continue; }

      // 列表
      if (/^[-*]\s+/.test(t) || /^\d+\.\s+/.test(t)) {
        const ordered = /^\d+\.\s+/.test(t);
        const items = [];
        while (idx < lines.length) {
          const lt = lines[idx].trim();
          const m = ordered ? lt.match(/^\d+\.\s+(.*)$/) : lt.match(/^[-*]\s+(.*)$/);
          if (!m) break;
          items.push(m[1]);
          idx++;
        }
        push({ type: 'list', ordered, items });
        continue;
      }

      // 段落
      const buf = [t];
      idx++;
      while (idx < lines.length) {
        const nt = lines[idx].trim();
        if (!nt || isSpecial(nt)) break;
        buf.push(nt);
        idx++;
      }
      addParagraph(buf.join(' '));
    }

    return doc;
  }

  /* ---------------- 数据建模 ---------------- */
  const ICON_RULES = [
    [/快速索引/, '🚨'], [/推荐顺序/, '✅'], [/避坑/, '⚠️'], [/未被识别/, '🧭'],
    [/初始化/, '🚀'], [/诊断|调试组合/, '🧪'], [/远程桌面/, '🖥️'],
    [/V4L2|采集卡|相机/, '📷'], [/串口/, '🔗'], [/USB/, '🔌'],
    [/U 盘|exFAT|磁盘|文件系统/, '💾'], [/打包|解压/, '🗜️'],
    [/内核|DKMS|驱动|模块/, '⚙️'], [/显卡|NVIDIA|PCI|FPGA/, '🎛️'],
    [/网络/, '🌐'], [/防火墙/, '🛡️'], [/进程|监控/, '📈'],
    [/日志/, '📜'], [/Systemd|服务/, '🧰'], [/媒体|截图|录屏/, '🎬'],
    [/权限/, '🔐'], [/用户|组/, '👥'], [/文件|目录/, '📁'],
    [/查找/, '🔎'], [/批量/, '🗂️'], [/系统|资源/, '📊'],
    [/一键|脚本/, '⚡'], [/安全|规范/, '🛡️']
  ];
  function iconFor(title) {
    const rule = ICON_RULES.find(([re]) => re.test(title));
    return rule ? rule[1] : '🧩';
  }

  function isCommandTable(head) {
    const joined = (head || []).join(' ');
    return /命令/.test(joined) && (/示例/.test(joined) || /用途|说明/.test(joined));
  }

  function tableCommands(head, row) {
    const iExample = head.findIndex((h) => /示例/.test(h));
    const iDesc = head.findIndex((h) => /用途|说明/.test(h));
    if (iExample < 0) return [];
    const name = stripMd(row[0] || '');
    const spans = Array.from(String(row[iExample] || '').matchAll(/`([^`]+)`/g)).map((m) => m[1].trim()).filter(Boolean);
    const cmds = spans.length ? spans : String(row[iExample] || '').split(/\s+\/\s+/).map((s) => stripMd(s)).filter(Boolean);
    const desc = stripMd(row[iDesc] || '') || name || '命令示例';
    return cmds.map((cmd) => ({ cmd, desc, name }));
  }

  function buildSectionCommands(section) {
    let n = 0;
    const make = (cmd, desc, name, block) => {
      const item = {
        id: `${section.id}-c${++n}`,
        key: normalizeCmd(cmd),
        cmd,
        desc: desc || section.title,
        name: name || cmd.split(/\s+/)[0],
        sectionId: section.id,
        sectionTitle: section.title,
        partId: section.partId,
        partName: section.partName,
        partNum: section.partNum,
        blockId: block ? block.id : '',
        sourceLabel: `${section.partName} · ${section.title}`
      };
      section.commands.push(item);
      if (block) {
        block.cmdIds = block.cmdIds || [];
        block.cmdIds.push(item.id);
      }
      return item;
    };
    section.blocks.forEach((block) => {
      if (block.type === 'code') {
        block.items.forEach((item) => {
          const made = make(item.cmd, item.desc || block.caption, null, block);
          item.commandId = made.id;
        });
      } else if (block.type === 'table' && isCommandTable(block.head)) {
        block.rows.forEach((row, rowIndex) => {
          const ids = [];
          tableCommands(block.head, row).forEach(({ cmd, desc, name }) => {
            ids.push(make(cmd, desc, name, block).id);
          });
          block.rowIds[rowIndex] = ids;
        });
      }
    });
  }

  function dedupe(list) {
    const map = new Map();
    list.forEach((cmdItem) => {
      const key = cmdItem.key || normalizeCmd(cmdItem.cmd);
      const source = {
        id: cmdItem.id,
        sectionId: cmdItem.sectionId,
        sectionTitle: cmdItem.sectionTitle,
        partId: cmdItem.partId,
        partName: cmdItem.partName,
        partNum: cmdItem.partNum
      };
      const hit = map.get(key);
      if (!hit) {
        map.set(key, Object.assign({}, cmdItem, { key, sources: [source] }));
      } else {
        if (cmdItem.desc && hit.desc && !hit.desc.includes(cmdItem.desc)) hit.desc = hit.desc + ' / ' + cmdItem.desc;
        if (!hit.sources.some((s) => s.id === cmdItem.id)) hit.sources.push(source);
      }
    });
    return Array.from(map.values());
  }

  function uniqueSources(cmdItem) {
    const seen = new Set();
    return (cmdItem.sources || []).filter((src) => {
      const key = src.partId + ':' + src.sectionId;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function summarizeSection(sec) {
    const para = sec.blocks.find((b) => b.type === 'p' && stripMd(b.text).length > 6);
    if (para) return truncate(stripMd(para.text), 96);
    const names = [];
    sec.commands.forEach((c) => {
      const name = c.name || c.cmd.split(/\s+/)[0];
      if (name && names.indexOf(name) === -1) names.push(name);
    });
    if (names.length) {
      const uniq = new Set(sec.commands.map((c) => c.key)).size;
      return names.slice(0, 4).join(' / ') + (uniq > 4 ? ` 等 ${uniq} 条指令` : '');
    }
    return sec.partName + ' · ' + sec.title;
  }

  /* ---------------- 建立数据模型 ---------------- */
  const doc = parseDoc(KB_DATA.markdown);
  doc.parts.forEach((part) => {
    const firstP = part.blocks.find((b) => b.type === 'p');
    part.tagline = firstP ? stripMd(firstP.text) : '';
    if (part.id === 'safety' && !part.tagline) part.tagline = '权限原则、避坑清单、新装推荐顺序与设备排查顺序。';
    if (part.id === 'index') part.tagline = '按症状直接定位优先命令，点击即可跳转或复制。';
  });

  const introQuote = doc.intro.find((b) => b.type === 'quote');
  if (introQuote) {
    doc.usage = introQuote.lines
      .filter((line) => /^\d+\.\s*/.test(line.trim()))
      .map((line) => stripMd(line.replace(/^\d+\.\s*/, '')))
      .filter(Boolean);
  }

  const ALL_SECTIONS = doc.parts.filter((p) => !p.special).flatMap((p) => p.sections);
  ALL_SECTIONS.forEach((sec) => {
    buildSectionCommands(sec);
    sec.cmdCount = dedupe(sec.commands).length;
    sec.icon = iconFor(sec.title);
    sec.summary = summarizeSection(sec);
  });

  const SECTION_MAP = new Map();
  const PART_MAP = new Map();
  doc.parts.forEach((part) => {
    PART_MAP.set(part.id, part);
    part.sections.forEach((sec) => SECTION_MAP.set(sec.id, sec));
    part.cmdCount = dedupe(part.sections.flatMap((sec) => sec.commands)).length;
    part.desc = part.tagline;
  });

  const RAW_COMMANDS = ALL_SECTIONS.flatMap((sec) => sec.commands);
  const UNIQUE_COMMANDS = dedupe(RAW_COMMANDS);
  UNIQUE_COMMANDS.forEach((c) => { c.favKey = c.key; });
  const COMMAND_BY_KEY = new Map(UNIQUE_COMMANDS.map((c) => [c.key, c]));
  const COMMAND_BY_ID = new Map(RAW_COMMANDS.map((c) => [c.id, c]));

  const indexPart = doc.parts.find((p) => p.id === 'index');
  const quickRows = indexPart
    ? indexPart.blocks.filter((b) => b.type === 'table').flatMap((b) => b.rows)
    : [];
  const QUICK_ROWS = quickRows.filter((r) => r.length >= 2).map((row, i) => ({
    id: 'qi-' + (i + 1),
    symptom: stripMd(row[0]),
    cmdText: stripMd(row[1]),
    raw: row
  }));

  function resolveCommand(text) {
    const key = normalizeCmd(text);
    if (!key) return null;
    if (COMMAND_BY_KEY.has(key)) return COMMAND_BY_KEY.get(key);
    let hit = UNIQUE_COMMANDS.find((c) => c.key.startsWith(key + ' '));
    if (hit) return hit;
    const safe = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const wordRe = new RegExp('(^|\\s)' + safe + '($|\\s)');
    hit = UNIQUE_COMMANDS.find((c) => wordRe.test(c.key));
    if (hit) return hit;
    return UNIQUE_COMMANDS.find((c) => c.key.indexOf(key) !== -1) || null;
  }

  const QUICK_INDEX = QUICK_ROWS.map((row) => {
    const parts = row.cmdText.split(/\s*[、,，]\s*|\s+\/\s+/).map((s) => s.trim()).filter(Boolean);
    const cmds = parts.map((text) => {
      const target = resolveCommand(text);
      return { text, target, cmd: target ? target.cmd : text };
    });
    return Object.assign({}, row, {
      cmds,
      target: cmds.map((c) => c.target).find(Boolean) || null
    });
  });

  /* ---------------- 本地状态 ---------------- */
  const favs = new Set(storage.get('favs', []));
  let recent = storage.get('recent', []).filter((id) => SECTION_MAP.has(id));
  if (!Array.isArray(recent)) recent = [];
  let tocObserver = null;
  const nav = { paletteOpen: false, activeIndex: 0, paletteList: [] };

  /* ---------------- 渲染工具 ---------------- */
  function escapeRegExp(str) {
    return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function highlightHtml(html, query, cls) {
    if (!query) return html;
    const tokens = Array.from(new Set(String(query).toLowerCase().split(/\s+/).filter((t) => t.length >= 1)));
    if (!tokens.length) return html;
    const pattern = tokens.sort((a, b) => b.length - a.length).map(escapeRegExp).join('|');
    let re;
    try { re = new RegExp('(' + pattern + ')', 'gi'); } catch (err) { return html; }
    const open = cls === 'hl' ? '<span class="hl">' : '<mark>';
    const close = cls === 'hl' ? '</span>' : '</mark>';
    return html.replace(/(<[^>]+>)|([^<]+)/g, (match, tag, text) => {
      if (tag) return tag;
      return text.replace(re, open + '$1' + close);
    });
  }

  function inline(raw, query) {
    const text = String(raw == null ? '' : raw);
    const parts = text.split(/(`[^`]+`)/g);
    const html = parts.map((part) => {
      if (part.length > 1 && part.charAt(0) === '`' && part.charAt(part.length - 1) === '`') {
        const code = part.slice(1, -1);
        return '<code class="ic" data-copy="' + esc(code) + '" title="点击复制：' + esc(truncate(code, 60)) + '">' +
          highlightHtml(esc(code), query) + '</code>';
      }
      let str = esc(part);
      str = str.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      str = str.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
      return str;
    }).join('');
    return highlightHtml(html, query);
  }

  /* ---------------- 复制 / 收藏 / 提示 ---------------- */
  let toastTimer = null;
  function showToast(message) {
    const toast = $('#toast');
    if (!toast) return;
    toast.innerHTML = '<span class="tick">✓</span>' + esc(message);
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 1900);
  }

  function copyText(value, label) {
    const text = String(value == null ? '' : value);
    if (!text) return;
    const done = () => showToast(label || ('已复制：' + truncate(text.replace(/\n/g, ' ; '), 72)));
    const fallback = () => {
      const area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', 'readonly');
      area.style.position = 'fixed';
      area.style.left = '-9999px';
      document.body.appendChild(area);
      area.select();
      try { document.execCommand('copy'); done(); }
      catch (err) { showToast('复制失败，请手动选择命令'); }
      area.remove();
    };
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(done).catch(fallback);
    } else {
      fallback();
    }
  }

  function starButton(cmdItem, extraClass) {
    const key = cmdItem.favKey || cmdItem.key;
    const on = favs.has(key);
    return '<button class="star-btn ' + (extraClass || '') + (on ? ' on' : '') + '" type="button" data-fav="' + esc(key) + '" data-cmd-id="' + esc(cmdItem.id || '') + '" aria-label="' + (on ? '取消收藏' : '收藏') + '" title="' + (on ? '取消收藏' : '收藏此指令') + '">' + (on ? '★' : '☆') + '</button>';
  }
  function copyButton(text, label) {
    return '<button class="copy-btn" type="button" data-copy="' + esc(text) + '" aria-label="' + esc(label || '复制') + '" title="' + esc(label || '复制') + '">⧉</button>';
  }

  function syncFavUI() {
    $$('.star-btn[data-fav]').forEach((btn) => {
      const on = favs.has(btn.getAttribute('data-fav'));
      btn.classList.toggle('on', on);
      btn.textContent = on ? '★' : '☆';
      btn.setAttribute('aria-label', on ? '取消收藏' : '收藏');
      btn.title = on ? '取消收藏' : '收藏此指令';
    });
    const navFav = $('#navFavCount');
    if (navFav) navFav.textContent = String(favs.size);
  }

  function toggleFav(key) {
    if (!key) return;
    const now = !favs.has(key);
    if (now) favs.add(key); else favs.delete(key);
    storage.set('favs', Array.from(favs));
    syncFavUI();
    showToast(now ? '已收藏：' + truncate(key, 60) : '已取消收藏');
    if (parseRoute().path === 'favorites') renderRoute(true);
    else {
      const favOnly = $('#favOnly');
      if (favOnly && favOnly.checked) filterAll();
    }
  }

  function partShort(partId) {
    return { daily: '日常', full: '完整', safety: '规范', index: '索引' }[partId] || '其他';
  }
  function partLabel(partOrId) {
    const id = typeof partOrId === 'string' ? partOrId : partOrId.id;
    return { daily: '日常精简版', full: '完整版', safety: '安全与规范', index: '快速索引' }[id] || '其他';
  }

  function sourceLinks(cmdItem, limit) {
    const sources = uniqueSources(cmdItem);
    const max = limit || 3;
    const html = sources.slice(0, max).map((src) =>
      '<a href="#/' + esc(src.sectionId) + '?focus=' + encodeURIComponent(src.id) + '" title="定位到 ' + esc(src.partName) + ' · ' + esc(src.sectionTitle) + '">' +
      esc(partShort(src.partId)) + ' · ' + esc(src.sectionTitle) + '</a>'
    ).join('<span class="sep"> / </span>');
    return html + (sources.length > max ? '<span class="c-dim"> +' + (sources.length - max) + '</span>' : '');
  }

  /* ---------------- 区块渲染 ---------------- */
  function renderTable(block, query) {
    const joined = block.head.join(' ');
    const isPitfall = /风险/.test(joined);
    const isCmd = isCommandTable(block.head);
    let html = '<div class="table-wrap" id="' + esc(block.id) + '"><table class="tbl"><thead><tr>';
    block.head.forEach((head) => {
      let cls = '';
      if (/示例/.test(head)) cls = 'c-ex';
      else if (/风险/.test(head)) cls = 'c-risk';
      else if (/建议/.test(head)) cls = 'c-ok';
      else if (isCmd && /说明/.test(head)) cls = 'c-dim';
      html += '<th class="' + cls + '">' + inline(head, query) + '</th>';
    });
    html += '</tr></thead><tbody>';
    block.rows.forEach((row, rowIndex) => {
      const ids = block.rowIds[rowIndex] || [];
      html += '<tr' + (ids.length ? ' data-cmd-ids="' + ids.join(' ') + '"' : '') + '>';
      row.forEach((cell, ci) => {
        let cls = '';
        if (isPitfall && /风险/.test(block.head[ci] || '')) cls = 'c-risk';
        if (isPitfall && /建议/.test(block.head[ci] || '')) cls = 'c-ok';
        if (isCmd && ci === 1) cls = 'c-dim';
        if (isCmd && ci === 2) cls = 'c-ex';
        html += '<td class="' + cls + '">' + inline(cell, query) + '</td>';
      });
      html += '</tr>';
    });
    html += '</tbody></table>';
    if (isCmd) html += '<div class="table-cap">行内命令可点击复制 · 示例命令已纳入全量检索</div>';
    html += '</div>';
    return html;
  }

  function renderTerm(block, query) {
    const items = (block.items || []).filter((item) => item.cmd);
    if (!items.length) return '';
    const all = block.code;
    const scriptMode = items.length === 1 && items[0].script;
    const ids = block.cmdIds || [];
    let html = '<div class="term" id="' + esc(block.id) + '"' + (scriptMode && ids[0] ? ' data-cmd-id="' + esc(ids[0]) + '"' : '') + '>';
    html += '<div class="term-head"><span class="term-dots"><i></i><i></i><i></i></span>' +
      '<span class="term-title">' + esc(block.caption) + '</span>' +
      '<span class="term-count">' + (scriptMode ? '脚本' : items.length + ' 条') + '</span>' +
      '<button class="term-copy" type="button" data-copy="' + esc(all) + '" title="复制整个代码块">复制全部</button></div>';
    if (scriptMode) {
      html += '<pre class="term-script">' + esc(items[0].cmd) + '</pre>';
      const cmdItem = ids[0] ? COMMAND_BY_ID.get(ids[0]) : null;
      if (cmdItem) {
        html += '<div class="term-note">脚本块保持原样 · ' + esc(cmdItem.desc || block.caption) +
          ' · <span style="float:right">' + copyButton(cmdItem.cmd, '复制脚本') + starButton(cmdItem) + '</span></div>';
      }
    } else {
      html += '<div class="term-body">';
      items.forEach((item, index) => {
        const id = item.commandId || ids[index] || '';
        const cmdItem = id ? COMMAND_BY_ID.get(id) : null;
        const star = cmdItem ? starButton(cmdItem) : '';
        html += '<div class="cmd-row"' + (id ? ' data-cmd-id="' + esc(id) + '"' : '') + '>';
        if (item.desc) {
          html += '<div class="cmd-top"><span class="cmd-desc">' + inline(item.desc, query) + '</span></div>';
        }
        html += '<div class="cmd-line"><span class="prompt" aria-hidden="true">$</span><code>' +
          highlightHtml(esc(item.cmd), query, 'hl') + '</code>' +
          '<span class="cmd-actions">' + copyButton(item.cmd) + star + '</span></div></div>';
      });
      html += '</div>';
    }
    html += '</div>';
    return html;
  }

  function renderQuote(block, query) {
    const text = block.lines.join('\n');
    const items = block.lines.filter((line) => /^\d+\.\s*/.test(line.trim()));
    const isDanger = /不要|谨慎|风险|销毁|删除/.test(text);
    const tone = isDanger ? ' danger' : ' warn';
    let body;
    if (items.length) {
      const intro = block.lines.filter((line) => !/^\d+\.\s*/.test(line.trim())).join(' ');
      body = '<div>' + (intro ? '<p>' + inline(intro, query) + '</p>' : '') + '<ol>' +
        items.map((line) => '<li>' + inline(line.replace(/^\d+\.\s*/, ''), query) + '</li>').join('') +
        '</ol></div>';
    } else {
      body = '<div>' + block.lines.map((line) => '<p>' + inline(line, query) + '</p>').join('') + '</div>';
    }
    return '<div class="note' + tone + '"><span class="note-ico">' + (isDanger ? '⚠️' : '💡') + '</span>' + body + '</div>';
  }

  function renderList(block, query) {
    const tag = block.ordered ? 'ol' : 'ul';
    return '<' + tag + '>' + block.items.map((item) => '<li>' + inline(item, query) + '</li>').join('') + '</' + tag + '>';
  }

  function renderCommandPanel(section) {
    const list = dedupe(section.commands);
    if (!list.length) return '';
    return '<details class="cmd-panel"><summary>本页指令索引 <span class="n">' + list.length +
      '</span><span style="color:var(--faint);font-size:10.5px;font-weight:400">按顺序排列 · 点击定位</span></summary>' +
      '<div class="cmd-list">' + list.map((cmdItem, index) =>
        '<div class="cmd-item" data-target="' + esc(cmdItem.id) + '">' +
        '<span class="idx">' + String(index + 1).padStart(2, '0') + '</span>' +
        '<code title="' + esc(cmdItem.cmd) + '">' + esc(cmdItem.cmd) + '</code>' +
        '<span class="desc">' + esc(cmdItem.desc) + '</span>' +
        copyButton(cmdItem.cmd) + starButton(cmdItem) +
        '</div>'
      ).join('') + '</div></details>';
  }

  function tocEntries(section) {
    const entries = [];
    section.blocks.forEach((block) => {
      if (block.type === 'h3') entries.push({ id: block.id, label: block.text, count: '' });
      if (block.type === 'code' && block.caption) {
        const prev = entries[entries.length - 1];
        if (prev && prev.label === block.caption) {
          prev.count = String((parseInt(prev.count, 10) || 0) + (block.items ? block.items.length : 1));
        } else {
          entries.push({ id: block.id, label: block.caption, count: String(block.items ? block.items.length : 1) });
        }
      }
    });
    return entries;
  }

  function renderBlock(block, query) {
    switch (block.type) {
      case 'h3': return '<h3 class="h3" id="' + esc(block.id) + '" data-toc-target="' + esc(block.id) + '">' + inline(block.text, query) + '</h3>';
      case 'p': return '<div class="sec-prose"><p>' + inline(block.text, query) + '</p></div>';
      case 'code': return renderTerm(block, query);
      case 'table': return renderTable(block, query);
      case 'quote': return renderQuote(block, query);
      case 'list': return '<div class="sec-prose">' + renderList(block, query) + '</div>';
      default: return '';
    }
  }

  /* ---------------- 数据提取 ---------------- */
  function sectionFlows(sec) {
    if (!sec) return [];
    return sec.blocks.filter((b) => b.type === 'code').map((b) => ({
      id: b.id,
      title: b.caption,
      cmds: (b.items || []).filter((i) => !i.script).map((i) => i.cmd)
    })).filter((f) => f.cmds.length);
  }

  function codeSteps(block) {
    if (!block || !block.code) return [];
    const lines = block.code.split('\n');
    const steps = [];
    let current = null;
    for (let i = 0; i < lines.length; i++) {
      const t = lines[i].trim();
      if (!t) continue;
      if (t.startsWith('#!')) continue;
      if (t.startsWith('#')) {
        current = { title: t.replace(/^#+\s*/, '').replace(/^\d+\.\s*/, ''), cmds: [] };
        steps.push(current);
        continue;
      }
      let cmd = t;
      while (cmd.endsWith('\\') && i + 1 < lines.length) {
        const next = lines[++i].trim();
        if (next) cmd += '\n' + next;
      }
      if (!current) {
        current = { title: '执行', cmds: [] };
        steps.push(current);
      }
      current.cmds.push(cmd);
    }
    return steps;
  }

  const DAILY_FLOW_SEC = ALL_SECTIONS.find((s) => s.partId === 'daily' && /快速诊断/.test(s.title));
  const FULL_FLOW_SEC = ALL_SECTIONS.find((s) => s.partId === 'full' && /调试组合/.test(s.title));
  const SETUP_SEC = ALL_SECTIONS.find((s) => s.partId === 'safety' && /推荐顺序/.test(s.title));
  const PITFALL_SEC = ALL_SECTIONS.find((s) => s.partId === 'safety' && /避坑/.test(s.title));
  const PERM_SEC = ALL_SECTIONS.find((s) => s.partId === 'safety' && /权限原则/.test(s.title));
  const SETUP_STEPS = SETUP_SEC ? codeSteps(SETUP_SEC.blocks.find((b) => b.type === 'code')) : [];
  const PITFALL_ROWS = PITFALL_SEC
    ? (PITFALL_SEC.blocks.find((b) => b.type === 'table') || { rows: [] }).rows
    : [];

  function renderIndexCards(list, query) {
    if (!list.length) return '<div class="empty"><span class="big">🔎</span><h3>没有匹配的故障</h3><p>试试更短的关键词，或直接打开智能搜索。</p></div>';
    return '<div class="index-grid">' + list.map((item, index) => {
      const chips = item.cmds.map((c) => {
        const target = c.target;
        const inner = '<code>' + highlightHtml(esc(c.text), query) + '</code>' + (target ? '<span class="go">↗</span>' : '');
        const copy = copyButton(c.cmd || c.text, '复制命令');
        if (!target) return '<span class="index-cmd">' + inner + copy + '</span>';
        return '<span class="index-cmd"><a href="#/' + esc(target.sectionId) + '?focus=' + encodeURIComponent(target.id) + '" title="定位到 ' + esc(target.sectionTitle) + '">' +
          inner + '</a>' + copy + '</span>';
      }).join('');
      const target = item.target;
      return '<article class="index-card" data-search="' + esc((item.symptom + ' ' + item.cmdText).toLowerCase()) + '">' +
        '<p class="index-symptom"><span class="ico">⚠️</span><span>' + highlightHtml(esc(item.symptom), query) + '</span><span class="no">' + String(index + 1).padStart(2, '0') + '</span></p>' +
        '<div class="index-cmds">' + chips + '</div>' +
        '<div class="index-foot"><span>优先命令</span>' +
        (target ? '<a href="#/' + esc(target.sectionId) + '?focus=' + encodeURIComponent(target.id) + '">定位到 ' + esc(target.sectionTitle) + ' →</a>' : '<a href="#/all">去全量检索 →</a>') +
        '</div></article>';
    }).join('') + '</div>';
  }

  /* ---------------- 总览 ---------------- */
  function renderOverview() {
    const daily = PART_MAP.get('daily');
    const full = PART_MAP.get('full');
    const recentSections = recent.map((id) => SECTION_MAP.get(id)).filter(Boolean).slice(0, 5);
    const usage = doc.usage.length ? doc.usage : ['命令与参数之间保留空格', '需要权限时加 sudo', '删除 / 写设备前确认路径', '改用户组后注销生效'];
    const flows = sectionFlows(DAILY_FLOW_SEC).slice(0, 4);
    const pitfalls = PITFALL_ROWS.slice(0, 6);
    const indexPreview = QUICK_INDEX.slice(0, 8);

    let html = '<section class="hero">' +
      '<div><span class="eyebrow">INDUSTRIAL LINUX · DEBUG ATLAS</span>' +
      '<h1>工控 Linux 部署调试<br><em>速查指令库</em></h1>' +
      '<p class="hero-sub">' + esc(KB_DATA.meta.subtitle) + '。把 38 个主题章节、' + UNIQUE_COMMANDS.length + ' 条去重命令做成可搜索、可定位、可复制的现场手册。</p>' +
      '<ul class="hero-badges">' + usage.map((item) => '<li>' + esc(item) + '</li>').join('') + '</ul>' +
      '<div class="hero-actions">' +
      '<button class="btn btn-primary" type="button" data-open-search>⌘ 智能搜索 <kbd>Ctrl K</kbd></button>' +
      '<a class="btn" href="#/index">🚨 故障快速索引</a>' +
      '<a class="btn btn-ghost" href="#/all">📚 全量指令</a>' +
      '</div></div>' +
      '<div class="hero-term" aria-hidden="true"><div class="hero-term-top"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span>site-debug — bash</span></div>' +
      '<div class="hero-term-body">' +
      '<div class="ln cm"># 1 · 设备与权限</div>' +
      '<div class="ln"><span class="pr">$</span> groups</div>' +
      '<div class="ln"><span class="pr">$</span> ls -l /dev/serial/by-id/</div>' +
      '<div class="ln cm"># 2 · 相机与驱动</div>' +
      '<div class="ln"><span class="pr">$</span> v4l2-ctl --list-devices</div>' +
      '<div class="ln"><span class="pr">$</span> sudo dkms status</div>' +
      '<div class="ln ok"># 先定位，再复制到终端</div>' +
      '</div></div></section>';

    html += '<div class="stats">' +
      '<div class="stat"><b>' + UNIQUE_COMMANDS.length + '</b><span>去重指令</span></div>' +
      '<div class="stat"><b>' + ALL_SECTIONS.length + '</b><span>主题章节</span></div>' +
      '<div class="stat"><b>' + daily.sections.length + '</b><span>日常精简版</span></div>' +
      '<div class="stat"><b>' + full.sections.length + '</b><span>完整版</span></div>' +
      '</div>';

    html += '<div class="start-grid">' +
      '<a class="start-card" href="#/index"><span class="ico">🚨</span><h3>故障先定位</h3><p>' + QUICK_INDEX.length + ' 个典型症状 → 优先命令，点一下直接跳到命令。</p><span class="arrow">打开快速索引 →</span></a>' +
      '<a class="start-card" href="#/daily"><span class="ico">🧰</span><h3>现场日常速查</h3><p>目录权限、串口、采集卡、USB、网络、日志、截图录屏。</p><span class="arrow">14 个日常章节 →</span></a>' +
      '<a class="start-card" href="#/full"><span class="ico">📚</span><h3>部署完整版</h3><p>内核、DKMS、V4L2、工业相机、远程桌面与批量操作。</p><span class="arrow">20 个完整章节 →</span></a>' +
      '<a class="start-card" href="#/all"><span class="ico">⌨️</span><h3>全量命令库</h3><p>按分区与章节过滤，合并重复命令，一键复制或定位来源。</p><span class="arrow">浏览全部指令 →</span></a>' +
      '</div>';

    if (recentSections.length) {
      html += '<div class="panel"><div class="panel-head"><h2 class="panel-title"><span class="ico">🕘</span>最近查看</h2><span class="spacer"></span><a class="btn btn-sm btn-ghost" href="#/favorites">我的收藏 →</a></div><div class="panel-body tight"><div class="recent-list">' +
        recentSections.map((sec) => '<a class="recent-item" href="#/' + esc(sec.id) + '"><span>' + sec.icon + '</span><b>' + esc(sec.title) + '</b><small>' + esc(partShort(sec.partId)) + ' · ' + sec.cmdCount + ' 条</small></a>').join('') +
        '</div></div></div>';
    }

    html += '<div class="panel"><div class="panel-head"><h2 class="panel-title"><span class="ico">🚨</span>故障快速索引</h2><span class="pill">' + QUICK_INDEX.length + ' 个症状</span><span class="spacer"></span><a class="btn btn-sm" href="#/index">查看全部 →</a></div><div class="panel-body">' +
      renderIndexCards(indexPreview, '') + '</div></div>';

    if (flows.length) {
      html += '<div class="panel"><div class="panel-head"><h2 class="panel-title"><span class="ico">🧪</span>现场快速诊断组合</h2><span class="pill">按顺序执行</span><span class="spacer"></span>' +
        (DAILY_FLOW_SEC ? '<a class="btn btn-sm btn-ghost" href="#/' + esc(DAILY_FLOW_SEC.id) + '">打开完整章节 →</a>' : '') +
        '</div><div class="panel-body"><div class="flow-grid">' +
        flows.map((flow, fi) => '<div class="flow-card"><div class="flow-head"><span class="step">' + String(fi + 1).padStart(2, '0') + '</span><h3>' + esc(flow.title) + '</h3><span class="count">' + flow.cmds.length + ' 条</span></div><div class="flow-body">' +
          flow.cmds.map((cmd, ci) => '<div class="flow-cmd"><span class="num">' + (ci + 1) + '</span><code>' + esc(cmd) + '</code>' + copyButton(cmd) + '</div>').join('') +
          '</div><div class="flow-foot">' + (DAILY_FLOW_SEC ? '<a href="#/' + esc(DAILY_FLOW_SEC.id) + '?focus=' + esc(flow.id) + '">在章节中查看 →</a>' : '') + '</div></div>').join('') +
        '</div></div></div>';
    }

    html += '<div class="overview-split">';
    if (SETUP_STEPS.length) {
      html += '<div class="panel"><div class="panel-head"><h2 class="panel-title"><span class="ico">🚀</span>新装工控机推荐顺序</h2><span class="spacer"></span>' +
        (SETUP_SEC ? '<a class="btn btn-sm btn-ghost" href="#/' + esc(SETUP_SEC.id) + '">查看原章节 →</a>' : '') +
        '</div><div class="panel-body"><div class="timeline">' +
        SETUP_STEPS.map((step) => '<div class="tl-step"><h4>' + esc(step.title) + '</h4><div class="tl-cmds">' +
          step.cmds.map((cmd) => '<button class="tl-cmd" type="button" data-copy="' + esc(cmd) + '" title="点击复制"><code>' + esc(truncate(cmd.replace(/\n/g, ' '), 64)) + '</code></button>').join('') +
          '</div></div>').join('') + '</div></div></div>';
    }
    if (pitfalls.length) {
      html += '<div class="panel"><div class="panel-head"><h2 class="panel-title"><span class="ico">⚠️</span>避坑清单</h2><span class="spacer"></span>' +
        (PITFALL_SEC ? '<a class="btn btn-sm btn-ghost" href="#/' + esc(PITFALL_SEC.id) + '">查看完整清单 →</a>' : '') +
        '</div><div class="panel-body"><div class="pitfall-grid">' +
        pitfalls.map((row) => '<div class="pitfall"><b>' + inline(row[0] || '') + '</b><span>' + inline(row[1] || '') + '</span><em>' + inline(row[2] || '') + '</em></div>').join('') +
        '</div></div></div>';
    }
    html += '</div>';

    return html;
  }

  /* ---------------- 分区页 ---------------- */
  function renderPart(partId) {
    const part = PART_MAP.get(partId);
    if (!part || part.special) return renderNotFound();
    const cards = part.sections.map((sec) =>
      '<a class="card" style="--part:' + part.color + '" href="#/' + esc(sec.id) + '">' +
      '<div class="card-top"><span class="card-icon">' + sec.icon + '</span><span class="card-no">' + esc(part.num) + '-' + esc(sec.no) + '</span></div>' +
      '<h3 class="card-title">' + esc(sec.no) + '. ' + esc(sec.title) + '</h3>' +
      '<p class="card-desc">' + esc(sec.summary) + '</p>' +
      '<div class="card-foot"><b>' + sec.cmdCount + '</b> 条指令<span class="go">打开 →</span></div></a>'
    ).join('');

    let html = '<section class="part-hero" style="--part:' + part.color + '">' +
      '<div class="part-icon" aria-hidden="true">' + part.icon + '</div>' +
      '<div><span class="eyebrow">' + esc(part.num) + ' · ' + esc(part.name) + '</span><h1>' + esc(partLabel(part.id)) + '</h1><p>' + esc(part.tagline || '') + '</p></div>' +
      '<div class="part-stat"><b>' + part.cmdCount + '</b><span>条去重指令 / ' + part.sections.length + ' 节</span></div>' +
      '</section>';

    if (part.id === 'safety') {
      html += '<div class="note warn"><span class="note-ico">🛡️</span><div><p><strong>生产环境优先用户组与最小权限。</strong>临时 <code>chmod 666</code> 只用于验证，确认后改用 <code>usermod</code> 加入对应设备组，并在注销 / 重启后复查。</p></div></div>';
    }
    html += '<div class="grid-cards">' + cards + '</div>';

    if (part.id === 'daily' || part.id === 'full') {
      const other = part.id === 'daily' ? PART_MAP.get('full') : PART_MAP.get('daily');
      html += '<div class="panel"><div class="panel-head"><h2 class="panel-title"><span class="ico">🔀</span>继续查看</h2><span class="spacer"></span><a class="btn btn-sm" href="#/' + other.id + '">' + esc(partLabel(other.id)) + ' →</a></div><div class="panel-body"><p class="muted" style="margin:0">' +
        (part.id === 'daily'
          ? '日常版覆盖现场最常用的 14 个主题；需要内核、DKMS、工业相机、远程桌面与批量操作时，进入完整版。'
          : '完整版覆盖部署与维护的 20 个主题；现场快速排查时，可以回到日常版或用故障快速索引。') +
        '</p><div style="margin-top:10px"><a class="btn btn-sm" href="#/index">🚨 故障快速索引</a> <a class="btn btn-sm" href="#/all">📚 全量指令</a></div></div></div>';
    }

    return html;
  }

  /* ---------------- 章节页 ---------------- */
  function pushRecent(sectionId) {
    recent = [sectionId].concat(recent.filter((id) => id !== sectionId)).slice(0, 6);
    storage.set('recent', recent);
  }

  function renderSection(section, params) {
    const query = params.get('q') || '';
    const focus = params.get('focus') || '';
    const part = PART_MAP.get(section.partId);
    const pos = ALL_SECTIONS.indexOf(section);
    const prev = ALL_SECTIONS[pos - 1];
    const next = ALL_SECTIONS[pos + 1];
    const entries = tocEntries(section);
    const unique = dedupe(section.commands);
    const copyAll = unique.map((c) => c.cmd).join('\n');
    pushRecent(section.id);

    let html = '<div class="section-layout" style="--part:' + part.color + '">';
    html += '<div class="section-main">';
    html += '<div class="sec-head">' +
      '<a class="part-pill" href="#/' + esc(part.id) + '">' + esc(part.num) + ' · ' + esc(partLabel(part.id)) + '</a>' +
      '<h1><span class="sec-ico" aria-hidden="true">' + section.icon + '</span> ' + esc(section.title) + '</h1>' +
      '<p class="sec-sum">' + esc(section.summary) + '</p>' +
      '<div class="sec-actions">' +
      '<span class="pill"><b>' + section.cmdCount + '</b> 条去重指令</span>' +
      (section.h3s.length ? '<span class="pill">' + section.h3s.length + ' 个子节</span>' : '') +
      '<button class="btn btn-sm" type="button" data-copy="' + esc(copyAll) + '" data-label="已复制本页全部 ' + unique.length + ' 条命令">⧉ 复制本页全部</button>' +
      '<button class="btn btn-sm btn-ghost" type="button" data-print>🖨️ 打印本节</button>' +
      (query ? '<span class="pill pill-amber">高亮：' + esc(query) + '</span>' : '') +
      '</div></div>';

    html += renderCommandPanel(section);
    html += section.blocks.map((block) => renderBlock(block, query)).join('');

    html += '<div class="pager">' +
      (prev ? '<a href="#/' + esc(prev.id) + '"><span class="pg-label">← 上一节 · ' + esc(partShort(prev.partId)) + '</span><span class="pg-title">' + prev.icon + ' ' + esc(prev.title) + '</span></a>' : '<a class="placeholder"></a>') +
      (next ? '<a class="next" href="#/' + esc(next.id) + '"><span class="pg-label">下一节 · ' + esc(partShort(next.partId)) + ' →</span><span class="pg-title">' + next.icon + ' ' + esc(next.title) + '</span></a>' : '<a class="placeholder"></a>') +
      '</div>';
    html += '</div>';

    html += '<aside class="toc"><div class="toc-card">' +
      '<div class="toc-head">本页导航<span style="margin-left:auto">' + entries.length + '</span></div>';
    if (entries.length) {
      html += '<nav class="toc-nav">' + entries.slice(0, 30).map((entry) =>
        '<button class="toc-link" type="button" data-toc-target="' + esc(entry.id) + '"><span class="toc-dot"></span><span>' + esc(entry.label) + '</span>' +
        (entry.count ? '<span class="toc-count">' + entry.count + '</span>' : '') + '</button>'
      ).join('') + '</nav>';
    } else {
      html += '<div class="toc-none">本页没有子标题，直接按顺序阅读即可。</div>';
    }
    html += '<div class="toc-actions"><button class="btn btn-sm" type="button" data-toc-top>↑ 回到顶部</button><button class="btn btn-sm" type="button" data-open-search>⌘ 搜索</button></div>';
    html += '<div class="toc-none" style="padding-top:0">共 ' + section.cmdCount + ' 条指令 · 点击代码行右侧 ⧉ 复制</div>';
    html += '</div></aside></div>';

    if (focus) setTimeout(() => focusElement(focus), 60);
    return html;
  }

  function focusElement(id) {
    let el = null;
    try {
      el = document.querySelector('[data-cmd-id="' + id + '"]') ||
        document.querySelector('[data-cmd-ids~="' + id + '"]') ||
        document.getElementById(id);
    } catch (err) { el = null; }
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.remove('flash');
    void el.offsetWidth;
    el.classList.add('flash');
    setTimeout(() => el.classList.remove('flash'), 2400);
  }

  /* ---------------- 全量指令 ---------------- */
  function countByPart(partId) {
    return UNIQUE_COMMANDS.filter((c) => uniqueSources(c).some((s) => s.partId === partId)).length;
  }

  function renderAll() {
    const parts = doc.parts.filter((p) => !p.special);
    let options = '<option value="all">全部章节</option>';
    parts.forEach((part) => {
      options += '<optgroup label="' + esc(partLabel(part.id)) + '">' +
        part.sections.map((sec) => '<option value="' + esc(sec.id) + '">' + esc(part.num + '-' + sec.no + ' ' + sec.title) + '</option>').join('') +
        '</optgroup>';
    });

    const rows = UNIQUE_COMMANDS.map((c, index) => {
      const sources = uniqueSources(c);
      const partIds = Array.from(new Set(sources.map((s) => s.partId))).join(' ');
      const sectionIds = Array.from(new Set(sources.map((s) => s.sectionId))).join(' ');
      const hay = (c.cmd + ' ' + c.desc + ' ' + sources.map((s) => s.sectionTitle + ' ' + s.partName).join(' ')).toLowerCase();
      const first = sources[0];
      return '<tr data-parts="' + esc(partIds) + '" data-sections="' + esc(sectionIds) + '" data-favkey="' + esc(c.favKey) + '" data-search="' + esc(hay) + '">' +
        '<td class="all-idx">' + String(index + 1).padStart(3, '0') + '</td>' +
        '<td class="all-cmd"><code>' + esc(c.cmd) + '</code></td>' +
        '<td class="all-desc">' + esc(c.desc) + '<small>' + esc(c.name || '') + '</small></td>' +
        '<td class="c-src">' + sourceLinks(c, 3) + '</td>' +
        '<td class="c-actions"><span class="row-act">' + copyButton(c.cmd) + starButton(c) +
        (first ? '<a class="copy-btn" href="#/' + esc(first.sectionId) + '?focus=' + encodeURIComponent(first.id) + '" title="定位到来源">↗</a>' : '') +
        '</span></td></tr>';
    }).join('');

    let html = '<div class="view-head"><span class="eyebrow">COMMAND LIBRARY</span><h1>全量指令</h1>' +
      '<p class="view-sub">日常精简版 + 完整版 + 安全规范，共 ' + UNIQUE_COMMANDS.length + ' 条去重指令。按分区、章节或关键词过滤；星标收藏，点击来源直接定位到原章节。</p>' +
      '<div class="meta-row"><span class="pill">去重合并<span style="font-family:var(--mono)"> ' + UNIQUE_COMMANDS.length + ' </span>条</span>' +
      '<span class="pill">原始条目 <b>' + RAW_COMMANDS.length + '</b></span><span class="pill pill-accent">支持多关键词，空格分隔</span></div></div>';

    html += '<div class="toolbar">' +
      '<div class="toolbar-row"><div class="chips" id="allPartChips">' +
      '<button class="chip active" type="button" data-part-filter="all">全部 <span class="n">' + UNIQUE_COMMANDS.length + '</span></button>' +
      '<button class="chip" type="button" data-part-filter="daily">日常 <span class="n">' + countByPart('daily') + '</span></button>' +
      '<button class="chip" type="button" data-part-filter="full">完整 <span class="n">' + countByPart('full') + '</span></button>' +
      '<button class="chip" type="button" data-part-filter="safety">规范 <span class="n">' + countByPart('safety') + '</span></button>' +
      '</div><span class="spacer" style="flex:1"></span><select class="select" id="allSection" aria-label="按章节过滤">' + options + '</select></div>' +
      '<div class="toolbar-row"><div class="tool-search"><span aria-hidden="true">🔍</span><input id="allQuery" type="search" placeholder="筛选命令 / 说明 / 章节，例如：相机 曝光、dkms、串口" autocomplete="off" aria-label="筛选命令"><span class="k">/</span></div>' +
      '<label class="switch"><input type="checkbox" id="favOnly"> ★ 仅收藏</label>' +
      '<button class="btn btn-sm" type="button" id="allReset">重置</button></div>' +
      '<div class="result-line"><span>显示 <b id="allCount">' + UNIQUE_COMMANDS.length + '</b> / ' + UNIQUE_COMMANDS.length + ' 条</span><span>·</span><span>重复命令已合并来源</span><span class="spacer"></span><span>⧉ 复制 · ☆ 收藏 · ↗ 定位</span></div>' +
      '</div>';

    html += '<div class="all-wrap"><table class="tbl" id="allTable"><thead><tr><th>#</th><th>命令</th><th>说明</th><th>来源</th><th style="text-align:right">操作</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
      '<div class="all-empty" id="allEmpty" hidden>没有匹配的指令，试试更短的关键词，或点「重置」。</div>';

    return html;
  }

  function filterAll() {
    const table = $('#allTable');
    if (!table) return;
    const query = (($('#allQuery') || {}).value || '').trim().toLowerCase();
    const tokens = query.split(/\s+/).filter(Boolean);
    const activeChip = $('#allPartChips .chip.active');
    const part = activeChip ? activeChip.getAttribute('data-part-filter') : 'all';
    const section = ($('#allSection') || {}).value || 'all';
    const favOnly = !!($('#favOnly') || {}).checked;
    let count = 0;
    $$('#allTable tbody tr').forEach((tr) => {
      const hay = tr.getAttribute('data-search') || '';
      const parts = (tr.getAttribute('data-parts') || '').split(' ');
      const sections = (tr.getAttribute('data-sections') || '').split(' ');
      const show = tokens.every((token) => hay.indexOf(token) !== -1) &&
        (part === 'all' || parts.indexOf(part) !== -1) &&
        (section === 'all' || sections.indexOf(section) !== -1) &&
        (!favOnly || favs.has(tr.getAttribute('data-favkey')));
      tr.classList.toggle('hide', !show);
      if (show) count++;
    });
    const countEl = $('#allCount');
    if (countEl) countEl.textContent = String(count);
    const emptyEl = $('#allEmpty');
    if (emptyEl) emptyEl.hidden = count !== 0;
    if (table.parentElement) table.parentElement.style.display = count ? '' : 'none';
  }

  /* ---------------- 故障快速索引 ---------------- */
  function renderIndex() {
    let html = '<div class="view-head"><span class="eyebrow">SYMPTOM → COMMAND</span><h1>故障快速索引</h1>' +
      '<p class="view-sub">从现场症状出发，直接给优先命令。点击命令跳转到原章节并高亮；右侧 ⧉ 只复制不跳转。</p>' +
      '<div class="meta-row"><span class="pill">' + QUICK_INDEX.length + ' 个典型症状</span><span class="pill pill-accent">先排查，再改配置</span></div></div>';
    html += '<div class="toolbar"><div class="toolbar-row"><div class="tool-search"><span aria-hidden="true">🔍</span>' +
      '<input id="indexQuery" type="search" placeholder="过滤症状或命令，例如：相机、串口、端口、dkms" autocomplete="off" aria-label="过滤故障索引"><span class="k">/</span></div>' +
      '<button class="btn btn-sm" type="button" id="indexReset">重置</button></div>' +
      '<div class="result-line"><span>显示 <b id="indexCount">' + QUICK_INDEX.length + '</b> / ' + QUICK_INDEX.length + ' 个症状</span><span class="spacer"></span><span>命令可复制，也可定位原文</span></div></div>';
    html += '<div id="indexResults">' + renderIndexCards(QUICK_INDEX, '') + '</div>';
    html += '<div class="empty" id="indexEmpty" hidden><span class="big">🔎</span><h3>没有匹配的症状</h3><p>换一个更短的关键词，或打开全局智能搜索。</p><button class="btn" type="button" data-open-search>打开智能搜索</button></div>';
    html += '<div class="note"><span class="note-ico">🧭</span><div><p><strong>排查顺序建议：</strong>先确认设备是否被系统识别（<code>lsusb</code> / <code>lspci</code> / <code>ls /dev</code>），再确认权限（<code>groups</code>），最后看驱动与日志（<code>dkms status</code> / <code>dmesg</code> / <code>journalctl</code>）。</p></div></div>';
    return html;
  }

  function filterIndex() {
    const input = $('#indexQuery');
    if (!input) return;
    const tokens = input.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    let count = 0;
    $$('#indexResults .index-card').forEach((card) => {
      const hay = card.getAttribute('data-search') || '';
      const show = tokens.every((token) => hay.indexOf(token) !== -1);
      card.classList.toggle('hide', !show);
      if (show) count++;
    });
    const countEl = $('#indexCount');
    if (countEl) countEl.textContent = String(count);
    const results = $('#indexResults');
    if (results) results.style.display = count ? '' : 'none';
    const empty = $('#indexEmpty');
    if (empty) empty.hidden = count !== 0;
  }

  /* ---------------- 我的收藏 ---------------- */
  function renderFavorites() {
    const list = UNIQUE_COMMANDS.filter((c) => favs.has(c.favKey));
    let html = '<div class="view-head"><span class="eyebrow">PINNED COMMANDS</span><h1>我的收藏</h1>' +
      '<p class="view-sub">收藏保存在浏览器本地。适合把现场最常用的命令固定下来，换机器 / 清缓存前请自行备份。</p>' +
      '<div class="meta-row"><span class="pill"><b>' + list.length + '</b> 条收藏</span>' +
      (list.length ? '<button class="btn btn-sm" type="button" id="clearFavs">清空收藏</button>' : '') + '</div></div>';
    if (!list.length) {
      html += '<div class="empty"><span class="big">⭐</span><h3>还没有收藏任何命令</h3><p>在命令右侧点 ☆，或在智能搜索里按 Ctrl+Enter 复制前先收藏。收藏会出现在这里，也会计入「仅收藏」过滤。</p>' +
        '<button class="btn btn-primary" type="button" data-open-search>打开智能搜索</button><a class="btn" href="#/all">浏览全量指令</a></div>';
      return html;
    }
    html += '<div class="fav-list">' + list.map((c) =>
      '<div class="fav-row">' +
      '<div class="fav-cmd"><code>' + esc(c.cmd) + '</code><span>' + esc(c.desc) + '</span></div>' +
      (uniqueSources(c)[0] ? '<a class="fav-src" href="#/' + esc(uniqueSources(c)[0].sectionId) + '?focus=' + encodeURIComponent(uniqueSources(c)[0].id) + '">' + esc(partShort(uniqueSources(c)[0].partId)) + ' · ' + esc(uniqueSources(c)[0].sectionTitle) + '</a>' : '') +
      copyButton(c.cmd) + starButton(c) + '</div>'
    ).join('') + '</div>';
    html += '<div class="note"><span class="note-ico">💡</span><div><p>收藏按命令本身去重：同一条命令同时出现在日常版与完整版时，只收藏一次。</p></div></div>';
    return html;
  }

  function renderNotFound() {
    return '<div class="empty" style="margin-top:40px"><span class="big">🧭</span><h3>页面不存在</h3><p>链接可能来自旧版本，或者命令已经重新编排。回到知识地图重新定位。</p><a class="btn btn-primary" href="#/overview">回到知识地图</a><a class="btn" href="#/all">全量指令</a></div>';
  }

  /* ---------------- 搜索算法 ---------------- */
  function fuzzySubsequence(token, text) {
    let pos = -1;
    let gap = 0;
    for (let i = 0; i < token.length; i++) {
      const next = text.indexOf(token.charAt(i), pos + 1);
      if (next === -1) return 0;
      if (pos >= 0) gap += next - pos - 1;
      pos = next;
    }
    return Math.max(8, 34 - gap - Math.max(0, text.length - token.length) * 0.1);
  }

  function fieldScore(token, value, weight) {
    const text = String(value || '').toLowerCase();
    if (!text) return 0;
    if (text === token) return 122 * weight;
    if (text.indexOf(token) === 0) return 98 * weight;
    const at = text.indexOf(token);
    if (at !== -1) return Math.max(32, 84 - at) * weight;
    if (token.length >= 2) {
      const fuzzy = fuzzySubsequence(token, text);
      if (fuzzy) return fuzzy * weight * 0.55;
    }
    return 0;
  }

  function scoreItem(tokens, fields) {
    let total = 0;
    for (let i = 0; i < tokens.length; i++) {
      let best = 0;
      for (let j = 0; j < fields.length; j++) {
        best = Math.max(best, fieldScore(tokens[i], fields[j][0], fields[j][1]));
      }
      if (!best) return 0;
      total += best;
    }
    return total;
  }

  function searchAll(query) {
    const tokens = String(query || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!tokens.length) return { tokens: [], sections: [], commands: [], symptoms: [], total: 0 };
    const sections = ALL_SECTIONS.map((sec) => ({
      sec,
      score: scoreItem(tokens, [[sec.title, 1.28], [sec.summary, 0.55], [sec.partName, 0.32], [sec.id, 0.1]])
    })).filter((r) => r.score > 0).sort((a, b) => b.score - a.score);

    const commands = UNIQUE_COMMANDS.map((cmdItem) => ({
      cmdItem,
      score: scoreItem(tokens, [[cmdItem.cmd, 1.32], [cmdItem.desc, 0.63], [cmdItem.sectionTitle, 0.48], [cmdItem.partName, 0.3]])
    })).filter((r) => r.score > 0).sort((a, b) => b.score - a.score);

    const symptoms = QUICK_INDEX.map((item) => ({
      item,
      score: scoreItem(tokens, [[item.symptom, 1.3], [item.cmdText, 0.75]])
    })).filter((r) => r.score > 0).sort((a, b) => b.score - a.score);

    return {
      tokens,
      sections,
      commands,
      symptoms,
      total: sections.length + commands.length + symptoms.length
    };
  }

  function renderSearchResults(results, query) {
    if (!results.tokens.length) {
      return '<div class="empty"><span class="big">⌘</span><h3>输入关键词开始定位</h3><p>支持命令名、中文说明、章节名与故障症状；多个关键词用空格分隔，例如「相机 曝光」或「串口 变号」。</p>' +
        '<div class="pal-quick" style="justify-content:center">' + ['v4l2-ctl', '串口变号', 'dkms', 'nvidia-smi', 'exfat', '端口占用', 'flameshot'].map((word) =>
          '<button class="quick-chip" type="button" data-quick="' + esc(word) + '">' + esc(word) + '</button>').join('') + '</div></div>';
    }
    if (!results.total) {
      return '<div class="empty"><span class="big">🔎</span><h3>没有匹配结果</h3><p>试试更短的命令名或症状关键词；也可以从 <a href="#/index" style="color:var(--accent)">故障快速索引</a> 进入。</p></div>';
    }

    let html = '';
    if (results.sections.length) {
      html += '<div class="panel"><div class="panel-head"><h2 class="panel-title"><span class="ico">§</span>相关章节</h2><span class="pill">' + results.sections.length + '</span></div><div class="panel-body"><div class="grid-cards">' +
        results.sections.slice(0, 12).map(({ sec }) =>
          '<a class="card" style="--part:' + sec.partColor + '" href="#/' + esc(sec.id) + '">' +
          '<div class="card-top"><span class="card-icon">' + sec.icon + '</span><span class="card-no">' + esc(sec.partNum + '-' + sec.no) + '</span></div>' +
          '<h3 class="card-title">' + highlightHtml(esc(sec.title), query) + '</h3>' +
          '<p class="card-desc">' + highlightHtml(esc(sec.summary), query) + '</p>' +
          '<div class="card-foot"><b>' + sec.cmdCount + '</b> 条指令<span class="go">打开 →</span></div></a>'
        ).join('') + '</div></div></div>';
    }
    if (results.commands.length) {
      html += '<div class="panel"><div class="panel-head"><h2 class="panel-title"><span class="ico">$</span>匹配命令</h2><span class="pill">' + results.commands.length + '</span></div>' +
        '<div class="all-wrap" style="max-height:none;border:0;border-radius:0"><table class="tbl"><thead><tr><th>命令</th><th>说明</th><th>来源</th><th style="text-align:right">操作</th></tr></thead><tbody>' +
        results.commands.slice(0, 60).map(({ cmdItem }) =>
          '<tr><td class="all-cmd"><code>' + highlightHtml(esc(cmdItem.cmd), query) + '</code></td>' +
          '<td class="all-desc">' + highlightHtml(esc(cmdItem.desc), query) + '</td>' +
          '<td class="c-src">' + sourceLinks(cmdItem, 2) + '</td>' +
          '<td class="c-actions"><span class="row-act">' + copyButton(cmdItem.cmd) + starButton(cmdItem) +
          (uniqueSources(cmdItem)[0] ? '<a class="copy-btn" href="#/' + esc(uniqueSources(cmdItem)[0].sectionId) + '?focus=' + encodeURIComponent(uniqueSources(cmdItem)[0].id) + '" title="定位">↗</a>' : '') +
          '</span></td></tr>'
        ).join('') + '</tbody></table>' + (results.commands.length > 60 ? '<div class="table-cap">仅显示前 60 条，继续输入可缩小范围</div>' : '') + '</div></div>';
    }
    if (results.symptoms.length) {
      html += '<div class="panel"><div class="panel-head"><h2 class="panel-title"><span class="ico">!</span>相关故障</h2><span class="pill">' + results.symptoms.length + '</span></div><div class="panel-body">' +
        renderIndexCards(results.symptoms.map((r) => r.item), query) + '</div></div>';
    }
    return html;
  }

  function renderSearch(q) {
    const results = searchAll(q);
    let html = '<div class="view-head"><span class="eyebrow">SMART SEARCH</span><h1>搜索结果</h1>' +
      '<p class="view-sub">命中 <b id="searchPageCount">' + results.total + '</b> 项：章节、命令与故障症状。搜索页可分享，命令可直接复制或定位原文。</p></div>';
    html += '<div class="toolbar"><div class="toolbar-row"><div class="tool-search">' +
      '<span aria-hidden="true">🔍</span><input id="searchPageQuery" type="search" placeholder="输入命令、说明、章节或症状" autocomplete="off" value="' + esc(q) + '" aria-label="搜索">' +
      '<span class="k">多词用空格</span></div><span class="spacer" style="flex:1"></span><button class="btn btn-sm" type="button" data-open-search>⌘ 智能搜索面板</button></div>' +
      '<div class="result-line"><span>搜索词：<b>' + esc(q || '（空）') + '</b></span><span>·</span><span>支持命令名 / 中文说明 / 故障症状</span></div></div>';
    html += '<div id="searchResults">' + renderSearchResults(results, q) + '</div>';
    return html;
  }

  function updateSearchPage() {
    const input = $('#searchPageQuery');
    if (!input) return;
    const query = input.value;
    const results = searchAll(query);
    const target = $('#searchResults');
    if (target) target.innerHTML = renderSearchResults(results, query);
    const count = $('#searchPageCount');
    if (count) count.textContent = String(results.total);
    try { history.replaceState(null, '', '#/search' + (query.trim() ? '?q=' + encodeURIComponent(query) : '')); } catch (err) { /* 忽略 */ }
  }

  /* ---------------- 智能搜索面板 ---------------- */
  const PALETTE_QUICK = ['v4l2-ctl', '串口变号', 'dkms', 'nvidia-smi', 'exfat', '端口占用', 'ffmpeg', '截图'];
  const HOT_KEYS = ['v4l2-ctl --list-devices', 'ls -l /dev/serial/by-id/', 'groups', 'sudo dkms status', 'dmesg -w', 'ip addr', 'sudo ss -tulnp', 'ffplay -f v4l2 /dev/video0'];
  const HOT_COMMANDS = HOT_KEYS.map((key) => COMMAND_BY_KEY.get(normalizeCmd(key))).filter(Boolean);

  function sectionPaletteItem(sec) {
    return {
      type: 'section', title: sec.title, sub: sec.summary,
      src: partShort(sec.partId) + ' · ' + sec.cmdCount + ' 条',
      sectionId: sec.id, cmdId: '', badge: '章节', sec
    };
  }
  function commandPaletteItem(cmdItem) {
    const src = uniqueSources(cmdItem)[0];
    return {
      type: 'cmd', title: cmdItem.cmd, sub: cmdItem.desc, cmd: cmdItem.cmd, cmdItem,
      src: src ? partShort(src.partId) + ' · ' + src.sectionTitle : '',
      sectionId: src ? src.sectionId : '', cmdId: src ? src.id : '', badge: '命令'
    };
  }
  function symptomPaletteItem(item) {
    const target = item.target;
    return {
      type: 'symptom', title: item.symptom, sub: item.cmdText, cmd: item.cmdText,
      src: target ? partShort(target.partId) + ' · ' + target.sectionTitle : '',
      sectionId: target ? target.sectionId : '', cmdId: target ? target.id : '', badge: '症状'
    };
  }

  function paletteItemHTML(item, index, query) {
    const title = highlightHtml(esc(item.title), query);
    const sub = highlightHtml(esc(truncate(item.sub || '', 120)), query);
    const copy = item.cmd ? copyButton(item.cmd, '复制命令') : '';
    const star = item.cmdItem ? starButton(item.cmdItem) : '';
    return '<div class="pal-item" data-pal-index="' + index + '" data-section="' + esc(item.sectionId) + '" data-cmd-id="' + esc(item.cmdId) + '">' +
      '<span class="pal-ico" aria-hidden="true">' + (item.type === 'section' ? '§' : item.type === 'symptom' ? '!' : '$') + '</span>' +
      '<span class="pal-main"><span class="pal-title">' + title + '</span>' +
      '<span class="pal-sub">' + (item.src ? esc(item.src) + ' · ' : '') + sub + '</span></span>' +
      '<span class="pal-badge">' + esc(item.badge) + '</span>' +
      '<span class="pal-actions">' + copy + star + '</span></div>';
  }

  function renderPaletteBody(query) {
    const q = String(query || '').trim();
    const groups = [];
    nav.paletteList = [];
    const addGroup = (label, items) => {
      if (!items.length) return;
      const entries = items.map((item) => {
        item.index = nav.paletteList.length;
        nav.paletteList.push(item);
        return item;
      });
      groups.push({ label, entries });
    };

    if (q) {
      const results = searchAll(q);
      addGroup('章节', results.sections.slice(0, 5).map((r) => sectionPaletteItem(r.sec)));
      addGroup('命令 · Enter 定位 / Ctrl+Enter 复制', results.commands.slice(0, 26).map((r) => commandPaletteItem(r.cmdItem)));
      addGroup('故障症状', results.symptoms.slice(0, 6).map((r) => symptomPaletteItem(r.item)));
    } else {
      addGroup('最近查看', recent.map((id) => SECTION_MAP.get(id)).filter(Boolean).slice(0, 4).map(sectionPaletteItem));
      addGroup('常用指令', HOT_COMMANDS.map(commandPaletteItem));
    }

    let html = groups.map((group) =>
      '<div class="pal-group"><div class="pal-label">' + group.label + '<span class="n">' + group.entries.length + '</span></div>' +
      group.entries.map((item) => paletteItemHTML(item, item.index, q)).join('') + '</div>'
    ).join('');

    if (!q) {
      html += '<div class="pal-group"><div class="pal-label">快速入口</div><div class="pal-quick">' +
        PALETTE_QUICK.map((word) => '<button class="quick-chip" type="button" data-quick="' + esc(word) + '">' + esc(word) + '</button>').join('') +
        '</div></div>';
    }
    if (!groups.length) {
      html = '<div class="pal-empty"><b>没有匹配结果</b><br>试试更短的命令名或症状，例如 <span class="mono">v4l2</span>、<span class="mono">dkms</span>、串口变号。</div>';
    }
    const body = $('#paletteBody');
    if (body) body.innerHTML = html;
    setPaletteActive(0);
  }

  function setPaletteActive(index) {
    const items = $$('#paletteBody .pal-item');
    if (!items.length) { nav.activeIndex = -1; return; }
    const safe = Math.max(0, Math.min(index, items.length - 1));
    nav.activeIndex = safe;
    items.forEach((el, i) => el.classList.toggle('active', i === safe));
    const active = items[safe];
    if (active) active.scrollIntoView({ block: 'nearest' });
  }

  function movePalette(delta) {
    const items = $$('#paletteBody .pal-item');
    if (!items.length) return;
    let next = nav.activeIndex + delta;
    if (next < 0) next = items.length - 1;
    if (next >= items.length) next = 0;
    setPaletteActive(next);
  }

  function openPalette(initialQuery) {
    const palette = $('#palette');
    if (!palette) return;
    palette.hidden = false;
    nav.paletteOpen = true;
    document.body.style.overflow = 'hidden';
    const input = $('#paletteInput');
    if (input) {
      input.value = initialQuery || '';
      renderPaletteBody(input.value);
      setTimeout(() => { input.focus(); input.select(); }, 20);
    }
  }

  function closePalette() {
    const palette = $('#palette');
    if (!palette) return;
    palette.hidden = true;
    nav.paletteOpen = false;
    document.body.style.overflow = '';
    if ($('#searchTrigger')) $('#searchTrigger').focus();
  }

  function navigateToSection(sectionId, cmdId, query) {
    if (!sectionId) {
      if (query) window.location.hash = '#/search?q=' + encodeURIComponent(query);
      return;
    }
    const params = new URLSearchParams();
    if (cmdId) params.set('focus', cmdId);
    if (query) params.set('q', query);
    const hash = '#/' + sectionId + (params.toString() ? '?' + params.toString() : '');
    closePalette();
    if (window.location.hash === hash) renderRoute(true);
    else window.location.hash = hash;
  }

  function gotoPaletteActive() {
    const item = nav.paletteList[nav.activeIndex];
    if (!item) return;
    const query = ($('#paletteInput') || {}).value || '';
    if (item.type === 'section') {
      closePalette();
      const hash = '#/' + item.sectionId + (query.trim() ? '?q=' + encodeURIComponent(query.trim()) : '');
      if (window.location.hash === hash) renderRoute(true);
      else window.location.hash = hash;
      return;
    }
    navigateToSection(item.sectionId, item.cmdId, query.trim());
  }

  /* ---------------- 路由 / 页面框架 ---------------- */
  function parseRoute() {
    const raw = window.location.hash.replace(/^#\/?/, '') || 'overview';
    const qIndex = raw.indexOf('?');
    let path = qIndex >= 0 ? raw.slice(0, qIndex) : raw;
    const params = new URLSearchParams(qIndex >= 0 ? raw.slice(qIndex + 1) : '');
    try { path = decodeURIComponent(path); } catch (err) { /* 保留原始路径 */ }
    return { path, params };
  }

  function updateChrome(path, section) {
    const crumbs = $('#crumbs');
    if (crumbs) {
      const link = (href, label) => '<a href="#/' + href + '">' + esc(label) + '</a>';
      let parts;
      if (path === 'overview') parts = ['知识地图 · 总览'];
      else if (path === 'daily' || path === 'full' || path === 'safety') {
        parts = [link('overview', '知识地图'), esc(partLabel(path))];
      } else if (section) {
        parts = [link('overview', '知识地图'), link(section.partId, partLabel(section.partId)), '<span class="cur">' + esc(section.title) + '</span>'];
      } else if (path === 'all') parts = [link('overview', '知识地图'), '<span class="cur">全量指令</span>'];
      else if (path === 'index') parts = [link('overview', '知识地图'), '<span class="cur">故障快速索引</span>'];
      else if (path === 'favorites') parts = [link('overview', '知识地图'), '<span class="cur">我的收藏</span>'];
      else if (path === 'search') parts = [link('overview', '知识地图'), '<span class="cur">搜索结果</span>'];
      else parts = ['未找到'];
      crumbs.innerHTML = parts.join('<span class="sep">/</span>');
    }
    $$('.nav-item').forEach((item) => {
      const active = item.getAttribute('data-view') === path ||
        (section && item.getAttribute('data-section-id') === section.id);
      item.classList.toggle('active', !!active);
    });
    const meta = $('#topbarMeta');
    if (meta) meta.textContent = UNIQUE_COMMANDS.length + ' 条指令 · ' + ALL_SECTIONS.length + ' 节';
    document.title = (section ? section.title : path === 'overview' ? '知识地图' : path === 'all' ? '全量指令' : path === 'index' ? '故障快速索引' : path === 'favorites' ? '我的收藏' : path === 'search' ? '搜索结果' : partLabel(path)) + ' · ' + doc.title;
  }

  function renderRoute(force) {
    const route = parseRoute();
    const params = route.params;
    let html = '';
    let section = null;

    if (route.path === 'overview') html = renderOverview();
    else if (route.path === 'daily' || route.path === 'full' || route.path === 'safety') html = renderPart(route.path);
    else if (route.path === 'all') html = renderAll();
    else if (route.path === 'index') html = renderIndex();
    else if (route.path === 'favorites') html = renderFavorites();
    else if (route.path === 'search') html = renderSearch(params.get('q') || '');
    else if (SECTION_MAP.has(route.path)) {
      section = SECTION_MAP.get(route.path);
      html = renderSection(section, params);
    } else html = renderNotFound();

    const view = $('#view');
    if (view) view.innerHTML = html;
    updateChrome(route.path, section);
    closeMobileNav();
    if (tocObserver) { tocObserver.disconnect(); tocObserver = null; }
    if (section) initTocSpy();
    if (route.path === 'all') filterAll();
    if (route.path === 'index') filterIndex();
    if (!section || !params.get('focus')) window.scrollTo(0, 0);
    syncFavUI();
    if (force && section && params.get('focus')) setTimeout(() => focusElement(params.get('focus')), 80);
  }

  function initTocSpy() {
    const links = $$('.toc-link');
    if (!links.length) return;
    const targets = links.map((link) => document.getElementById(link.getAttribute('data-toc-target'))).filter(Boolean);
    if (!targets.length) return;
    const activate = (id) => {
      links.forEach((link) => link.classList.toggle('active', link.getAttribute('data-toc-target') === id));
    };
    if ('IntersectionObserver' in window) {
      tocObserver = new IntersectionObserver((entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length) activate(visible[0].target.id);
      }, { rootMargin: '-86px 0px -62% 0px', threshold: 0.01 });
      targets.forEach((target) => tocObserver.observe(target));
    }
    activate(targets[0].id);
  }

  function closeMobileNav() {
    document.body.classList.remove('nav-open');
  }

  /* ---------------- 初始化 / 事件 ---------------- */
  function buildNav() {
    const fill = (targetId, part) => {
      const el = document.getElementById(targetId);
      if (!el || !part) return;
      el.innerHTML = part.sections.map((sec) =>
        '<a class="nav-item nav-sub" data-section-id="' + esc(sec.id) + '" href="#/' + esc(sec.id) + '" style="--part:' + part.color + '">' +
        '<span class="nav-num">' + sec.no + '</span><span class="nav-title">' + esc(sec.title) + '</span></a>'
      ).join('');
    };
    fill('navDaily', PART_MAP.get('daily'));
    fill('navFull', PART_MAP.get('full'));
    fill('navSafety', PART_MAP.get('safety'));
    const cmdCount = $('#navCmdCount');
    if (cmdCount) cmdCount.textContent = String(UNIQUE_COMMANDS.length);
  }

  function applyTheme(theme) {
    const value = theme === 'light' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', value);
    const button = $('#themeToggle');
    if (button) {
      button.textContent = value === 'dark' ? '🌙' : '☀️';
      button.title = value === 'dark' ? '切换到浅色主题' : '切换到深色主题';
      button.setAttribute('aria-label', button.title);
    }
    storage.set('theme', value);
  }

  function resetAllFilters() {
    const input = $('#allQuery');
    if (input) input.value = '';
    const section = $('#allSection');
    if (section) section.value = 'all';
    const favOnly = $('#favOnly');
    if (favOnly) favOnly.checked = false;
    $$('#allPartChips .chip').forEach((chip, index) => chip.classList.toggle('active', index === 0));
    filterAll();
  }

  function isTyping(target) {
    if (!target) return false;
    const tag = (target.tagName || '').toLowerCase();
    return tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable;
  }

  function bindEvents() {
    const scrim = document.createElement('div');
    scrim.className = 'nav-scrim';
    scrim.setAttribute('aria-hidden', 'true');
    document.body.appendChild(scrim);
    scrim.addEventListener('click', closeMobileNav);

    document.addEventListener('click', (event) => {
      if (event.target.closest('#palette')) return;

      const copyEl = event.target.closest('[data-copy]');
      if (copyEl) {
        event.preventDefault();
        copyText(copyEl.getAttribute('data-copy'), copyEl.getAttribute('data-label') || '');
        return;
      }
      const favEl = event.target.closest('[data-fav]');
      if (favEl) {
        event.preventDefault();
        toggleFav(favEl.getAttribute('data-fav'));
        return;
      }
      const quick = event.target.closest('[data-quick]');
      if (quick) {
        event.preventDefault();
        openPalette(quick.getAttribute('data-quick'));
        return;
      }
      if (event.target.closest('[data-open-search]')) {
        event.preventDefault();
        openPalette('');
        return;
      }
      if (event.target.closest('[data-print]')) {
        event.preventDefault();
        window.print();
        return;
      }
      if (event.target.closest('[data-toc-top]')) {
        event.preventDefault();
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
      const tocLink = event.target.closest('[data-toc-target]');
      if (tocLink) {
        event.preventDefault();
        const id = tocLink.getAttribute('data-toc-target');
        const el = document.getElementById(id);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        $$('.toc-link').forEach((link) => link.classList.toggle('active', link === tocLink));
        return;
      }
      const cmdItem = event.target.closest('.cmd-item[data-target]');
      if (cmdItem) {
        event.preventDefault();
        focusElement(cmdItem.getAttribute('data-target'));
        return;
      }
      const partChip = event.target.closest('#allPartChips .chip');
      if (partChip) {
        $$('#allPartChips .chip').forEach((chip) => chip.classList.toggle('active', chip === partChip));
        filterAll();
        return;
      }
      if (event.target.closest('#allReset')) {
        resetAllFilters();
        return;
      }
      if (event.target.closest('#indexReset')) {
        const input = $('#indexQuery');
        if (input) { input.value = ''; filterIndex(); input.focus(); }
        return;
      }
      if (event.target.closest('#clearFavs')) {
        if (window.confirm('确定清空所有收藏吗？此操作不可撤销。')) {
          favs.clear();
          storage.set('favs', []);
          syncFavUI();
          renderRoute(true);
        }
        return;
      }
      if (event.target.closest('#menuBtn')) {
        document.body.classList.toggle('nav-open');
        return;
      }
      if (event.target.closest('#themeToggle')) {
        applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
        return;
      }
      if (event.target.closest('#printBtn')) {
        window.print();
        return;
      }
      if (event.target.closest('#searchTrigger') || event.target.closest('#topSearch')) {
        openPalette('');
        return;
      }
      if (event.target.closest('a[href^="#/"]')) closeMobileNav();
    });

    document.addEventListener('input', (event) => {
      if (event.target.id === 'allQuery') filterAll();
      else if (event.target.id === 'indexQuery') filterIndex();
      else if (event.target.id === 'searchPageQuery') debouncedSearchPage();
    });
    document.addEventListener('change', (event) => {
      if (event.target.id === 'allSection' || event.target.id === 'favOnly') filterAll();
    });

    document.addEventListener('keydown', (event) => {
      const key = event.key;
      if ((event.ctrlKey || event.metaKey) && key.toLowerCase() === 'k') {
        event.preventDefault();
        openPalette('');
        return;
      }
      if (key === '/' && !nav.paletteOpen && !isTyping(event.target)) {
        event.preventDefault();
        openPalette('');
        return;
      }
      if (key === 'Escape') {
        if (nav.paletteOpen) closePalette();
        closeMobileNav();
      }
    });

    const palette = $('#palette');
    if (palette) {
      palette.addEventListener('click', (event) => {
        if (event.target.closest('[data-close-palette]')) closePalette();
      });
    }
    const paletteBody = $('#paletteBody');
    if (paletteBody) {
      paletteBody.addEventListener('click', (event) => {
        const copyEl = event.target.closest('[data-copy]');
        if (copyEl) {
          event.preventDefault();
          copyText(copyEl.getAttribute('data-copy'), copyEl.getAttribute('data-label') || '');
          return;
        }
        const favEl = event.target.closest('[data-fav]');
        if (favEl) {
          event.preventDefault();
          toggleFav(favEl.getAttribute('data-fav'));
          return;
        }
        const quick = event.target.closest('[data-quick]');
        if (quick) {
          event.preventDefault();
          const input = $('#paletteInput');
          if (input) {
            input.value = quick.getAttribute('data-quick');
            renderPaletteBody(input.value);
            input.focus();
          }
          return;
        }
        const item = event.target.closest('.pal-item');
        if (item) {
          const index = Number(item.getAttribute('data-pal-index'));
          if (!Number.isNaN(index)) {
            nav.activeIndex = index;
            gotoPaletteActive();
          }
        }
      });
    }
    const paletteInput = $('#paletteInput');
    if (paletteInput) {
      paletteInput.addEventListener('input', debounce(() => renderPaletteBody(paletteInput.value), 60));
      paletteInput.addEventListener('keydown', (event) => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault();
          movePalette(event.key === 'ArrowDown' ? 1 : -1);
          return;
        }
        if (event.key === 'Enter') {
          event.preventDefault();
          if (event.ctrlKey || event.metaKey) {
            const item = nav.paletteList[nav.activeIndex];
            if (item && item.cmd) copyText(item.cmd, '');
            return;
          }
          if (nav.paletteList.length) gotoPaletteActive();
          else {
            const query = paletteInput.value.trim();
            if (query) {
              closePalette();
              window.location.hash = '#/search?q=' + encodeURIComponent(query);
            }
          }
          return;
        }
        if (event.key === 'Escape') {
          event.preventDefault();
          closePalette();
        }
      });
    }
  }

  const debouncedSearchPage = debounce(updateSearchPage, 140);

  function init() {
    buildNav();
    applyTheme(storage.get('theme', 'dark'));
    if (!window.location.hash) {
      try { history.replaceState(null, '', '#/overview'); } catch (err) { window.location.hash = '#/overview'; }
    }
    bindEvents();
    window.addEventListener('hashchange', () => renderRoute());
    renderRoute();
    syncFavUI();
  }

  init();
})();
















