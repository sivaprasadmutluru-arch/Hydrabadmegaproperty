import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { getDb } from '../../../../db/index';
import { registrations, settings } from '../../../../db/schema';
import { POST as register } from '../../expo/route';
export const dynamic = 'force-dynamic';

function publicPass(record: Record<string, unknown>) {
  const { id, name, category, status, payment, amount, checkedIn } = record;
  return { id, name, category, status, payment, amount, checkedIn };
}
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: {'Cache-Control':'no-store'} });

export async function GET(req: Request) {
  try {
    const db = getDb();
    const id = new URL(req.url).searchParams.get('id');
    if (id) {
      const rows = await db.select().from(registrations).where(eq(registrations.id, id));
      return rows[0] ? reply(publicPass(rows[0])) : reply({error:'Pass not found'},404);
    }
    const row = (await db.select().from(settings).where(eq(settings.id,'event')))[0];
    const stored = JSON.parse(row?.value || '{}');
    const visible = Object.fromEntries(['dates','venue','contact','paymentUrl'].filter(k=>typeof stored[k] === 'string').map(k=>[k,stored[k]]));
    return reply({settings:JSON.stringify(visible)});
  } catch {
    return reply({error:'Unable to load data. Please try again.'},500);
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (body && typeof body === 'object' && Object.hasOwn(body,'action')) return reply({error:'Organizer actions require administrator access'},403);
    const registration = z.object({category:z.string(),data:z.record(z.string())}).strict().parse(body);
    const result = await register(new Request(req.url, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(registration)}));
    const data = await result.json();
    return result.ok ? reply(publicPass(data),result.status) : reply(data,result.status);
  } catch (error) {
    return reply({error:error instanceof SyntaxError || error instanceof z.ZodError ? 'Invalid request data' : 'Unable to save. Please try again.'},error instanceof SyntaxError || error instanceof z.ZodError ? 400 : 500);
  }
}
