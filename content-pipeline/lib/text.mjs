/**
 * 文本处理原语：Gutenberg 清洗 → 分章 → 分句 → 分词。
 * 供 build.mjs（入库）与 adapt.mjs（改写）共用，保证两条链路切出来的章节完全一致。
 */

export function stripGutenberg(raw) {
  const startMarker = /\*\*\*\s*START OF (?:THE|THIS) PROJECT GUTENBERG EBOOK[^\n]*\*\*\*/i;
  const endMarker = /\*\*\*\s*END OF (?:THE|THIS) PROJECT GUTENBERG EBOOK[^\n]*\*\*\*/i;
  let text = raw;
  const startMatch = text.match(startMarker);
  if (startMatch?.index !== undefined) text = text.slice(startMatch.index + startMatch[0].length);
  const endMatch = text.match(endMarker);
  if (endMatch?.index !== undefined) text = text.slice(0, endMatch.index);
  return text.replace(/\r\n/g, "\n");
}

export function splitChapters(text) {
  const chapterRe =
    /^[ \t]*(?:CHAPTER|Chapter|PART|Part|BOOK|Book|ADVENTURE|Adventure)\s+([IVXLCDM]+|\d+)\b[.:]?[ \t]*(.*)$/gm;
  const marks = [];
  let match;
  while ((match = chapterRe.exec(text)) !== null) {
    marks.push({ index: match.index, numeral: match[1], title: (match[2] ?? "").trim(), length: match[0].length });
  }

  const chapters = marks.map((mark, i) => {
    const from = mark.index + mark.length;
    const to = i + 1 < marks.length ? marks[i + 1].index : text.length;
    let title = mark.title;
    if (!title) {
      const after = text
        .slice(from, Math.min(from + 200, to))
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
      title = after[0] ?? `Chapter ${mark.numeral}`;
    }
    return {
      key: mark.numeral,
      title: title.replace(/\s+/g, " ").slice(0, 120),
      body: text.slice(from, to),
    };
  });

  // 目录页会重复出现章节标题：同一编号只保留正文最长的那一段（目录条目正文极短）
  const best = new Map();
  for (const chapter of chapters) {
    const prev = best.get(chapter.key);
    if (!prev || chapter.body.length > prev.body.length) best.set(chapter.key, chapter);
  }

  const filtered = [...best.values()].filter((c) => c.body.trim().length >= 500);
  if (filtered.length === 0) return [{ index: 1, title: "Chapter 1", body: text.trim() }];
  return filtered.map((c, i) => ({ index: i + 1, title: c.title, body: c.body }));
}

export function paragraphs(body) {
  return body
    .split(/\n{2,}/)
    .map((p) => p.replace(/\n/g, " ").replace(/\s+/g, " ").trim())
    .filter((p) => p.length > 0 && !/^\[Illustration\]/.test(p));
}

/**
 * 有些书没有 CHAPTER 标记，硬切会变成"一章 10 万词"。
 * 把超长章节按段落边界切成 ~3500 词的"节"，至少保证一章能一次读完。
 */
export function expandLongChapters(chapters, maxWords = 6000, targetWords = 3500) {
  const out = [];
  let index = 0;
  for (const chapter of chapters) {
    const paras = paragraphs(chapter.body);
    const total = paras.reduce((acc, p) => acc + p.split(/\s+/).length, 0);
    if (total <= maxWords) {
      out.push({ index: (index += 1), title: chapter.title, body: chapter.body });
      continue;
    }
    let buffer = [];
    let bufferWords = 0;
    let part = 1;
    const flush = () => {
      if (buffer.length === 0) return;
      out.push({
        index: (index += 1),
        title: `${chapter.title}（${part}）`,
        body: buffer.join("\n\n"),
      });
      buffer = [];
      bufferWords = 0;
      part += 1;
    };
    for (const para of paras) {
      buffer.push(para);
      bufferWords += para.split(/\s+/).length;
      if (bufferWords >= targetWords) flush();
    }
    flush();
  }
  return out;
}

export function toSentences(paragraph) {
  const text = paragraph.replace(/\s+/g, " ").trim();
  if (!text) return [];
  const out = [];
  let start = 0;
  const abbrev = /\b(Mr|Mrs|Ms|Dr|St|Jr|Sr|Prof|Capt|Col|Gen|e\.g|i\.e)\.$/i;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch !== "." && ch !== "!" && ch !== "?") continue;
    let end = i + 1;
    while (end < text.length && /["'”’)]/.test(text[end])) end += 1;
    const candidate = text.slice(start, end);
    const nextChar = text[end] ?? "";
    if (!(end >= text.length || /\s/.test(nextChar))) continue;
    if (ch === "." && abbrev.test(candidate)) continue;
    const sentence = candidate.trim();
    if (sentence.length > 0) {
      const offset = candidate.indexOf(sentence);
      out.push({ text: sentence, start: start + offset });
    }
    start = end;
    while (start < text.length && /\s/.test(text[start])) start += 1;
  }
  const tail = text.slice(start).trim();
  if (tail.length > 0) out.push({ text: tail, start: text.length - tail.length });
  return out;
}

export function tokenize(sentence) {
  const tokens = [];
  const re = /[A-Za-z]+(?:['’][A-Za-z]+)*/g;
  let match;
  while ((match = re.exec(sentence)) !== null) {
    tokens.push({ surface: match[0], start: match.index, end: match.index + match[0].length });
  }
  return tokens;
}
