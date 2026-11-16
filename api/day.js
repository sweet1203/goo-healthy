// api/day.js — Notion 프록시 (goo-healthy / Healthy 9)
// ──────────────────────────────────────────────────────────────────────────
//  GET  /api/day                 → 30일 전체 요약(달력·진행률용)
//  GET  /api/day?date=YYYY-MM-DD → 특정 날짜 상세(속성 + 페이지 본문 운동 체크리스트)
//  PATCH /api/day  { notionId, prop, value }   → DB 속성(체크박스/한줄메모) 저장
//  PATCH /api/day  { blockId, checked }         → 페이지 본문 개별 운동(to_do) 체크 저장
//
//  안전 설계
//   - 체크박스 4종(아침/저녁/테니스/산책)·한줄메모는 "페이지 속성" PATCH 로만 저장합니다.
//   - 개별 운동 항목은 기존 to_do 블록의 checked 플래그만 PATCH 합니다.
//     (블록을 지우거나 새로 만들지 않으므로 사용자가 노션에 적어둔 내용이 보존됩니다.)
//   - Notion 토큰은 NOTION_TOKEN 환경변수로만 사용하고 응답에 담지 않습니다.
// ──────────────────────────────────────────────────────────────────────────

const NOTION_VERSION = '2022-06-28';
const NOTION_API = 'https://api.notion.com/v1';
// 30일 데일리 운동 체크 DB (환경변수로 덮어쓸 수 있음)
const DB_ID = (process.env.NOTION_DB_ID || '41a0fb7d-31de-8143-a1a7-df5474a9e8ce').trim();

// 쓰기를 허용하는 속성 화이트리스트 (임의 속성 쓰기 방지)
const CHECK_PROPS = ['아침 완료', '저녁 완료', '테니스 기초연습', '산책 완료'];
const TEXT_PROPS = ['한줄메모'];

function isAuthorized(req) {
  const token = (req.headers['authorization'] || '').replace('Bearer ', '').trim();
  const secret = (process.env.DEV_PASSWORD || '').trim();
  return !!secret && token === secret;
}

function notionHeaders() {
  return {
    Authorization: `Bearer ${(process.env.NOTION_TOKEN || '').trim()}`,
    'Notion-Version': NOTION_VERSION,
    'Content-Type': 'application/json',
  };
}

const plain = (rt) => (rt || []).map((t) => t.plain_text ?? t.text?.content ?? '').join('');
const firstHref = (rt) => (rt || []).map((t) => t.href).find(Boolean) || null;

function propsOf(page) {
  const p = page.properties || {};
  return {
    notionId: page.id,
    pageUrl: page.url,
    title: plain(p['날짜별 운동']?.title),
    date: p['운동일']?.date?.start || '',
    dow: p['요일']?.select?.name || '',
    place: p['장소']?.select?.name || '',
    kind: p['운동종류']?.select?.name || '',
    checks: {
      '아침 완료': !!p['아침 완료']?.checkbox,
      '저녁 완료': !!p['저녁 완료']?.checkbox,
      '테니스 기초연습': !!p['테니스 기초연습']?.checkbox,
      '산책 완료': !!p['산책 완료']?.checkbox,
    },
    memo: plain(p['한줄메모']?.rich_text),
  };
}

async function queryByDate(date) {
  const r = await fetch(`${NOTION_API}/databases/${DB_ID}/query`, {
    method: 'POST',
    headers: notionHeaders(),
    body: JSON.stringify({ filter: { property: '운동일', date: { equals: date } }, page_size: 1 }),
  });
  const data = await r.json();
  if (!r.ok) throw httpError(r.status, data);
  return data.results[0] || null;
}

async function listBlocks(blockId) {
  const out = [];
  let cursor;
  do {
    const url = new URL(`${NOTION_API}/blocks/${blockId}/children`);
    url.searchParams.set('page_size', '100');
    if (cursor) url.searchParams.set('start_cursor', cursor);
    const r = await fetch(url, { headers: notionHeaders() });
    const data = await r.json();
    if (!r.ok) throw httpError(r.status, data);
    out.push(...(data.results || []));
    cursor = data.has_more ? data.next_cursor : null;
  } while (cursor);
  return out;
}

// 접이식(toggle / 토글 제목) 블록의 자식을 체크항목(items)과 설명줄(lines)로 분리
async function collectChildren(blockId) {
  const children = await listBlocks(blockId);
  const items = [];
  const lines = [];
  for (const c of children) {
    const ct = c.type;
    const crt = c[ct]?.rich_text;
    if (ct === 'to_do') {
      items.push({ id: c.id, text: plain(crt), checked: !!c.to_do?.checked });
    } else {
      const tx = plain(crt);
      if (tx) lines.push((ct.endsWith('list_item') ? '• ' : '') + tx);
    }
  }
  return { items, lines };
}

// 페이지 본문 → 화면에서 바로 그릴 수 있는 구조로 변환
async function parseBody(pageId) {
  const blocks = await listBlocks(pageId);
  const result = { summary: '', guide: null, sections: [] };
  let section = null;
  const push = (s) => { result.sections.push(s); return s; };

  for (const b of blocks) {
    const t = b.type;
    const data = b[t] || {};
    const rt = data.rich_text;

    if (t === 'callout') {
      if (!result.summary) result.summary = plain(rt);
    } else if (t === 'heading_1' || t === 'heading_2' || t === 'heading_3') {
      // 토글(접이식) 제목이면 접이식 섹션으로, 아니면 일반 섹션으로
      if (data.is_toggleable && b.has_children) {
        const { items, lines } = await collectChildren(b.id);
        push({ heading: plain(rt), collapsible: true, items, lines });
        section = null;
      } else {
        section = push({ heading: plain(rt), items: [], lines: [] });
      }
    } else if (t === 'toggle') {
      const { items, lines } = b.has_children ? await collectChildren(b.id) : { items: [], lines: [] };
      push({ heading: plain(rt) || '자세히 보기', collapsible: true, items, lines });
      section = null;
    } else if (t === 'to_do') {
      const item = { id: b.id, text: plain(rt), checked: !!b.to_do?.checked };
      if (!section) section = push({ heading: '', items: [], lines: [] });
      section.items.push(item);
    } else if (t === 'paragraph') {
      const text = plain(rt);
      const href = firstHref(rt);
      if (href && !result.guide) {
        result.guide = { text: text || '📷 기구 사진·사용법 보기', url: href };
      } else if (text && section) {
        section.lines.push(text);
      }
    } else if (t === 'bulleted_list_item' || t === 'numbered_list_item') {
      if (section) section.lines.push('• ' + plain(rt));
    }
  }
  return result;
}

function httpError(status, data) {
  const e = new Error((data && (data.message || data.code)) || `Notion 오류 ${status}`);
  e.status = status;
  e.notion = data;
  return e;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!isAuthorized(req)) return res.status(401).json({ error: '인증이 필요해요.' });
  if (!process.env.NOTION_TOKEN) {
    return res.status(500).json({ error: '서버에 NOTION_TOKEN 이 설정되지 않았어요.' });
  }

  try {
    // ── 특정 날짜 상세 ────────────────────────────────────────────────
    if (req.method === 'GET' && req.query.date) {
      const page = await queryByDate(req.query.date);
      if (!page) return res.status(200).json({ found: false });
      const base = propsOf(page);
      const body = await parseBody(page.id);
      return res.status(200).json({ found: true, ...base, body });
    }

    // ── 30일 전체 요약 (달력 / 진행률) ───────────────────────────────
    if (req.method === 'GET') {
      const r = await fetch(`${NOTION_API}/databases/${DB_ID}/query`, {
        method: 'POST',
        headers: notionHeaders(),
        body: JSON.stringify({ sorts: [{ property: '운동일', direction: 'ascending' }], page_size: 100 }),
      });
      const data = await r.json();
      if (!r.ok) {
        return res.status(r.status).json({
          error: data.message, notion_code: data.code, db_id: DB_ID,
          hint: '통합(integration)이 DB에 공유되어 있는지, NOTION_DB_ID 가 맞는지 확인하세요.',
        });
      }
      const days = (data.results || []).map((pg) => {
        const b = propsOf(pg);
        return {
          date: b.date, title: b.title, dow: b.dow, place: b.place, kind: b.kind,
          checks: b.checks, hasMemo: !!b.memo,
        };
      });
      return res.status(200).json({ days });
    }

    // ── 저장 (PATCH) ─────────────────────────────────────────────────
    if (req.method === 'PATCH') {
      const { notionId, prop, value, blockId, checked } = req.body || {};

      // 1) 개별 운동 to_do 블록 체크
      if (blockId) {
        const r = await fetch(`${NOTION_API}/blocks/${blockId}`, {
          method: 'PATCH', headers: notionHeaders(),
          body: JSON.stringify({ to_do: { checked: !!checked } }),
        });
        if (!r.ok) { const e = await r.json(); return res.status(r.status).json({ error: e.message }); }
        return res.status(200).json({ ok: true });
      }

      // 2) DB 속성(체크박스 / 한줄메모)
      if (!notionId || !prop) return res.status(400).json({ error: 'notionId 와 prop 이 필요해요.' });

      let properties;
      if (CHECK_PROPS.includes(prop)) {
        properties = { [prop]: { checkbox: !!value } };
      } else if (TEXT_PROPS.includes(prop)) {
        const text = String(value || '').slice(0, 2000);
        properties = { [prop]: { rich_text: text ? [{ text: { content: text } }] : [] } };
      } else {
        return res.status(400).json({ error: '허용되지 않은 속성이에요.' });
      }

      const r = await fetch(`${NOTION_API}/pages/${notionId}`, {
        method: 'PATCH', headers: notionHeaders(),
        body: JSON.stringify({ properties }),
      });
      if (!r.ok) { const e = await r.json(); return res.status(r.status).json({ error: e.message }); }
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }
}
