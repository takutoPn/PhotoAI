import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const toClient = (t: any) => ({
  ...t,
  createdAt: new Date(t.createdAt).getTime(),
  doneAt: t.doneAt ? new Date(t.doneAt).getTime() : undefined
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const body = await req.json();
  const patch: any = {};

  if (body.title !== undefined || body.text !== undefined) {
    const title = String(body.title ?? body.text ?? "").trim();
    patch.title = title;
    patch.text = title;
  }
  if (body.category !== undefined) patch.category = String(body.category);
  if (body.status !== undefined) {
    patch.status = String(body.status);
    patch.done = patch.status === "作業済み";
    patch.doneAt = patch.done ? new Date() : null;
  }
  if (body.startDate !== undefined) patch.startDate = body.startDate || null;
  if (body.endDate !== undefined) patch.endDate = body.endDate || null;
  if (body.description !== undefined) patch.description = body.description || null;

  const task = await prisma.task.update({ where: { id: params.id }, data: patch });
  return NextResponse.json({ task: toClient(task) });
}

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  await prisma.task.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
