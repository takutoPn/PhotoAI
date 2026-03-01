import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const toClient = (t: any) => ({
  ...t,
  createdAt: new Date(t.createdAt).getTime(),
  doneAt: t.doneAt ? new Date(t.doneAt).getTime() : undefined
});

export async function GET() {
  const tasks = await prisma.task.findMany({ orderBy: { createdAt: "desc" } });
  return NextResponse.json({ tasks: tasks.map(toClient) });
}

export async function POST(req: Request) {
  const body = await req.json();
  const title = String(body.title ?? body.text ?? "").trim();
  if (!title) return NextResponse.json({ error: "title required" }, { status: 400 });

  const status = String(body.status ?? "未着手");
  const done = status === "作業済み";

  const task = await prisma.task.create({
    data: {
      title,
      text: title,
      category: String(body.category ?? "P2"),
      status,
      startDate: body.startDate || null,
      endDate: body.endDate || null,
      description: body.description || null,
      done,
      doneAt: done ? new Date() : null
    }
  });

  return NextResponse.json({ task: toClient(task) });
}
