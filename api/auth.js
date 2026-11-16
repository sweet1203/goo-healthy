// api/auth.js — 간단 비밀번호 로그인 (goo-healthy)
// 성공 시 토큰(=비밀번호)을 돌려주고, 이후 요청은 Authorization: Bearer <token> 으로 인증합니다.
// 실제 Notion 토큰(NOTION_TOKEN)은 서버에만 두고 브라우저에 절대 노출하지 않습니다.

export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { password } = req.body || {};
  if (!password) return res.status(400).json({ ok: false, error: '비밀번호를 입력해주세요.' });

  // 환경변수/입력값의 앞뒤 공백·개행을 제거해 비교 (붙여넣기 실수 방지)
  const secret = (process.env.DEV_PASSWORD || '').trim();
  if (!secret) {
    return res.status(500).json({ ok: false, error: '서버에 DEV_PASSWORD 가 설정되지 않았어요.' });
  }
  if (String(password).trim() === secret) {
    // 저장되는 토큰은 공백을 제거한 정규화 값으로 돌려줍니다.
    return res.status(200).json({ ok: true, token: secret });
  }
  return res.status(401).json({ ok: false, error: '비밀번호가 틀렸어요.' });
}
