import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";

/**
 * GET /api/debug/smtp-test
 * Test SMTP configuration (same settings as Supabase Auth)
 * 
 * Query params:
 * - to: email address to send test to
 * - host: SMTP host (default: smtp-relay.brevo.com)
 * - port: SMTP port (default: 587)
 * - user: SMTP username
 * - pass: SMTP password
 * - from: Sender email
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  
  // Get params from URL or use defaults
  const host = searchParams.get("host") || "smtp-relay.brevo.com";
  const port = parseInt(searchParams.get("port") || "587");
  const user = searchParams.get("user");
  const pass = searchParams.get("pass");
  const from = searchParams.get("from") || "engineering@tcbmetalworks.com";
  const to = searchParams.get("to");

  console.log("=== SMTP TEST START ===");
  console.log("Host:", host);
  console.log("Port:", port);
  console.log("User:", user ? `${user.substring(0, 5)}...` : "NOT PROVIDED");
  console.log("Pass:", pass ? "PROVIDED (hidden)" : "NOT PROVIDED");
  console.log("From:", from);
  console.log("To:", to || "NOT PROVIDED");

  if (!user || !pass) {
    return NextResponse.json({
      success: false,
      error: "Missing required params: user and pass",
      usage: "/api/debug/smtp-test?user=YOUR_SMTP_USER&pass=YOUR_SMTP_KEY&to=test@example.com",
      note: "For Brevo SMTP, user is your email, pass is the SMTP key (not API key)"
    }, { status: 400 });
  }

  if (!to) {
    return NextResponse.json({
      success: false,
      error: "Missing 'to' param - email address to send test to",
      usage: "/api/debug/smtp-test?user=YOUR_SMTP_USER&pass=YOUR_SMTP_KEY&to=test@example.com"
    }, { status: 400 });
  }

  try {
    // Create transporter with same settings as Supabase would use
    console.log("Creating SMTP transporter...");
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465, // true for 465, false for other ports
      auth: {
        user,
        pass,
      },
      debug: true,
      logger: true,
    });

    // Verify connection
    console.log("Verifying SMTP connection...");
    await transporter.verify();
    console.log("✅ SMTP connection verified!");

    // Send test email
    console.log("Sending test email...");
    const info = await transporter.sendMail({
      from: `"SMTP Test" <${from}>`,
      to,
      subject: "SMTP Test - " + new Date().toISOString(),
      text: "This is a test email to verify SMTP configuration.",
      html: "<h1>SMTP Test</h1><p>This is a test email to verify SMTP configuration.</p><p>If you receive this, your SMTP settings are correct!</p>",
    });

    console.log("✅ Email sent successfully!");
    console.log("Message ID:", info.messageId);
    console.log("Response:", info.response);
    console.log("=== SMTP TEST END (SUCCESS) ===");

    return NextResponse.json({
      success: true,
      message: "Test email sent successfully!",
      messageId: info.messageId,
      response: info.response,
      config: {
        host,
        port,
        from,
        to,
      }
    });

  } catch (error: any) {
    console.error("❌ SMTP TEST FAILED");
    console.error("Error name:", error.name);
    console.error("Error message:", error.message);
    console.error("Error code:", error.code);
    console.error("Error response:", error.response);
    console.error("Error responseCode:", error.responseCode);
    console.error("Full error:", error);
    console.log("=== SMTP TEST END (FAILED) ===");

    return NextResponse.json({
      success: false,
      error: error.message,
      errorCode: error.code,
      errorResponse: error.response,
      errorResponseCode: error.responseCode,
      suggestion: getSuggestion(error),
      config: {
        host,
        port,
        from,
      }
    }, { status: 500 });
  }
}

function getSuggestion(error: any): string {
  const msg = error.message?.toLowerCase() || "";
  const code = error.code?.toLowerCase() || "";
  
  if (msg.includes("authentication") || code === "eauth") {
    return "Authentication failed. Check your username (should be your Brevo email) and password (should be the SMTP key from Brevo, NOT the API key).";
  }
  if (msg.includes("sender") || msg.includes("from")) {
    return "Sender address issue. Make sure the 'from' email is verified in your Brevo account (Settings → Senders & IP → Senders).";
  }
  if (code === "econnrefused" || code === "etimedout") {
    return "Connection issue. Check host and port. For Brevo: smtp-relay.brevo.com, port 587";
  }
  if (msg.includes("ssl") || msg.includes("tls")) {
    return "SSL/TLS issue. Try port 587 with STARTTLS or port 465 with SSL.";
  }
  
  return "Check your Brevo SMTP settings. Get SMTP key from: Brevo Dashboard → Settings → SMTP & API → SMTP key";
}

