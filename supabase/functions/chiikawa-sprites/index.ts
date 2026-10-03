// 바탕화면 치이카와 — 친구 코드를 확인하고, 비공개 버킷의 그림을 받을 임시 주소를 내준다.
//
//   POST { "code": "..." }
//   200 { "files": [{ "name": "chiikawa.png", "url": "https://…(10분짜리 서명 주소)" }, …] }
//   403 { "error": "code" }   코드가 없거나 꺼져 있다
//
// 버킷(chiikawa-sprites)과 코드 표(chiikawa_codes)에는 anon 이 닿는 정책이 하나도 없다.
// 이 함수만 서비스 키로 읽는다. 코드는 대소문자·앞뒤 공백을 가리지 않는다.
// JWT 검사는 끈다(verify_jwt=false) — 앱은 로그인하지 않고, 대신 코드가 문지기다.

import { createClient } from "jsr:@supabase/supabase-js@2.49.4";

const BUCKET = "chiikawa-sprites";
const SIGNED_SECONDS = 600;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "content-type, apikey, authorization",
      },
    });
  }
  if (req.method !== "POST") return json({ error: "method" }, 405);

  let code = "";
  try {
    const body = await req.json();
    code = String(body?.code ?? "").trim().toUpperCase();
  } catch {
    // 아래에서 빈 코드로 거절한다.
  }
  if (!code || code.length > 64) return json({ error: "code" }, 403);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const { data: row, error: codeError } = await admin
    .from("chiikawa_codes")
    .select("code")
    .eq("code", code)
    .eq("enabled", true)
    .maybeSingle();
  if (codeError) return json({ error: "server" }, 500);
  if (!row) return json({ error: "code" }, 403);

  const { data: objects, error: listError } = await admin.storage
    .from(BUCKET)
    .list("", { limit: 200, sortBy: { column: "name", order: "asc" } });
  if (listError) return json({ error: "server" }, 500);

  const names = (objects ?? [])
    .map((o) => o.name)
    .filter((n) => /^[A-Za-z0-9_-]+\.(png|gif|webp)$/i.test(n));
  if (!names.length) return json({ files: [] });

  const { data: signed, error: signError } = await admin.storage
    .from(BUCKET)
    .createSignedUrls(names, SIGNED_SECONDS);
  if (signError || !signed) return json({ error: "server" }, 500);

  return json({
    files: signed
      .filter((s) => s.signedUrl)
      .map((s) => ({ name: s.path, url: s.signedUrl })),
  });
});
