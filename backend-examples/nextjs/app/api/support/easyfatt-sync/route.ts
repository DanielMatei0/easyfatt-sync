import { NextResponse } from "next/server";
import { Resend } from "resend";
import {
  buildSupportConfirmationEmail,
  buildSupportInternalEmail,
} from "@/lib/support-email-templates";
import { parseSupportRequestBody } from "@/lib/support-validation";

export const runtime = "nodejs";

const resend = new Resend(process.env.RESEND_API_KEY);

const SUPPORT_FROM_EMAIL =
  process.env.SUPPORT_FROM_EMAIL || "Aven Labs <support@aven-labs.com>";
const SUPPORT_TO_EMAIL =
  process.env.SUPPORT_TO_EMAIL || "support@aven-labs.com";

export async function POST(request: Request) {
  try {
    if (!process.env.RESEND_API_KEY) {
      console.error("[support] RESEND_API_KEY mancante");
      return NextResponse.json(
        { ok: false, message: "Servizio temporaneamente non disponibile." },
        { status: 503 }
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { ok: false, message: "Richiesta non valida." },
        { status: 400 }
      );
    }

    const parsed = parseSupportRequestBody(body);
    if (!parsed.ok) {
      return NextResponse.json(
        { ok: false, message: parsed.message },
        { status: 400 }
      );
    }

    const payload = parsed.data;
    const internalEmail = buildSupportInternalEmail(payload);
    const confirmationEmail = buildSupportConfirmationEmail(payload);

    const [internalResult, confirmationResult] = await Promise.all([
      resend.emails.send({
        from: SUPPORT_FROM_EMAIL,
        to: [SUPPORT_TO_EMAIL],
        replyTo: payload.email,
        subject: internalEmail.subject,
        html: internalEmail.html,
      }),
      resend.emails.send({
        from: SUPPORT_FROM_EMAIL,
        to: [payload.email],
        subject: confirmationEmail.subject,
        html: confirmationEmail.html,
      }),
    ]);

    if (internalResult.error || confirmationResult.error) {
      console.error("[support] Errore Resend", {
        internal: internalResult.error,
        confirmation: confirmationResult.error,
      });
      return NextResponse.json(
        { ok: false, message: "Impossibile inviare la richiesta. Riprova più tardi." },
        { status: 502 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[support] Errore endpoint", error);
    return NextResponse.json(
      { ok: false, message: "Errore interno. Riprova più tardi." },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({ ok: false, message: "Metodo non consentito." }, { status: 405 });
}
