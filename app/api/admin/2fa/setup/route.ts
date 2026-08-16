import { NextResponse } from "next/server";
import { generateSecret, generateURI } from "otplib";
import QRCode from "qrcode";
import { getServerAuthSession } from "@/lib/auth";
import dbConnect from "@/lib/db";
import Admin from "@/models/Admin";
import { withDbErrorHandling } from "@/lib/with-db-error-handling";

const ISSUER = "Naprocs Tech Admin";

// Groundwork only: generates and persists a TOTP secret + QR code for the signed-in
// admin. The login flow does not yet challenge for a code — see lib/auth.ts. Wire
// enforcement in once this has been tested end to end with an authenticator app.
export const POST = withDbErrorHandling(async () => {
  const session = await getServerAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await dbConnect();
  const admin = await Admin.findById(session.user.id);
  if (!admin) {
    return NextResponse.json({ error: "Admin not found" }, { status: 404 });
  }

  const secret = generateSecret();
  const otpauthUrl = generateURI({
    issuer: ISSUER,
    label: admin.email,
    secret,
  });

  admin.totp_secret = secret;
  await admin.save();

  const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl);

  return NextResponse.json({ secret, otpauthUrl, qrCodeDataUrl });
});
