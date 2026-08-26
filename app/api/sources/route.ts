import { SOURCES } from "@/lib/sources";
import {
  addCustomSource,
  getCustomSources,
  removeCustomSource,
} from "@/lib/custom-sources";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// News-source management API (issue #5.13). GET lists built-in + custom feeds;
// POST validates and adds a feed; DELETE removes a custom feed by id.
export async function GET() {
  return Response.json({
    builtin: SOURCES,
    custom: getCustomSources(),
  });
}

export async function POST(req: Request) {
  let body: { name?: string; url?: string; category?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }
  const result = await addCustomSource({
    name: body.name ?? "",
    url: body.url ?? "",
    category: body.category,
  });
  return Response.json(result, { status: result.ok ? 201 : 400 });
}

export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) {
    return Response.json({ ok: false, error: "Missing id." }, { status: 400 });
  }
  const removed = removeCustomSource(id);
  return Response.json({ ok: removed }, { status: removed ? 200 : 404 });
}
