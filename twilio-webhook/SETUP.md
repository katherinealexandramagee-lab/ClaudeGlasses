# Twilio Voice Webhook Setup Guide

This guide walks you through setting up the Twilio voice webhook so you can call your Claude assistant from any phone.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     TWILIO VOICE FLOW                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  📱 Your Phone                                                   │
│       │                                                          │
│       │ Call Twilio number                                       │
│       ▼                                                          │
│  ┌─────────────┐                                                │
│  │   Twilio    │  Routes call to your webhook                   │
│  │   Cloud     │                                                │
│  └──────┬──────┘                                                │
│         │                                                        │
│         │ POST /voice/incoming                                   │
│         ▼                                                        │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐       │
│  │  Webhook    │────▶│  OpenClaw   │────▶│   Claude    │       │
│  │  Server     │     │  (optional) │     │     API     │       │
│  └──────┬──────┘     └─────────────┘     └─────────────┘       │
│         │                                                        │
│         │ TwiML response                                         │
│         ▼                                                        │
│  ┌─────────────┐                                                │
│  │   Twilio    │  Speaks response to caller                     │
│  │   TTS       │                                                │
│  └──────┬──────┘                                                │
│         │                                                        │
│         ▼                                                        │
│  📱 You hear Claude's response                                   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Prerequisites

- [x] Node.js 18+ installed
- [x] Twilio account with sandbox or phone number
- [x] Anthropic API key
- [x] A way to expose your local server (ngrok, Cloudflare Tunnel, etc.)

---

## Step 1: Install Dependencies

```bash
cd twilio-webhook
npm install
```

## Step 2: Configure Environment

```bash
# Copy the example env file
cp .env.example .env

# Edit with your credentials
nano .env  # or use your preferred editor
```

### Required Settings

```env
# From https://console.twilio.com (Dashboard)
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token_here

# From https://console.anthropic.com
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### Optional Settings

```env
# If using OpenClaw instead of direct Claude
OPENCLAW_WEBHOOK_URL=https://your-openclaw-server/webhook/glasses
OPENCLAW_API_KEY=your_openclaw_key

# Security: Only allow specific phone numbers to call
# Format: comma-separated, with country code
ALLOWED_CALLER_IDS=+14155551234,+14155555678

# Secret for iOS app webhook authentication
WEBHOOK_SECRET=generate_a_long_random_string
```

## Step 3: Start the Server

```bash
# Development mode (auto-restarts on changes)
npm run dev

# Or production mode
npm run build
npm start
```

You should see:

```
🦞 ClaudeGlasses Twilio Webhook
================================
📡 Server running on port 3456

Endpoints:
   GET  /health              - Health check
   POST /voice/incoming      - Twilio incoming call
   POST /voice/process       - Process speech
   POST /voice/status        - Call status updates
   POST /webhook/glasses     - iOS app webhook
```

## Step 4: Expose Your Server

Twilio needs to reach your server from the internet.

### Option A: ngrok (Easiest for Testing)

```bash
ngrok http 3456
```

You'll get a URL like `https://abc123.ngrok-free.app`

### Option B: Cloudflare Tunnel (Free, More Stable)

```bash
cloudflared tunnel --url http://localhost:3456
```

### Option C: Tailscale Funnel (If You Use Tailscale)

```bash
tailscale funnel 3456
```

**Save your public URL** - you'll need it for Step 5.

## Step 5: Configure Twilio

### Using Twilio Sandbox (Free Testing)

1. Go to [Twilio Console](https://console.twilio.com)
2. Navigate to **Voice** → **Try it Out** → **Sandbox**
3. Configure the sandbox:

   | Setting | Value |
   |---------|-------|
   | **A CALL COMES IN** | Webhook |
   | **URL** | `https://your-ngrok-url.ngrok-free.app/voice/incoming` |
   | **HTTP Method** | POST |

4. Note your **Sandbox phone number** - this is what you'll call

### Using a Real Twilio Phone Number

1. Go to **Phone Numbers** → **Manage** → **Active Numbers**
2. Click your phone number
3. Scroll to **Voice Configuration**
4. Set:

   | Setting | Value |
   |---------|-------|
   | **A CALL COMES IN** | Webhook |
   | **URL** | `https://your-domain.com/voice/incoming` |
   | **HTTP Method** | POST |
   | **Status Callback URL** | `https://your-domain.com/voice/status` |

5. Click **Save Configuration**

## Step 6: Test It!

1. Call your Twilio phone number
2. You should hear: *"Hi! I'm Claude. How can I help you today?"*
3. Ask a question
4. Hear Claude's response
5. Say "goodbye" to end the call

---

## Twilio Sandbox Specifics

The Twilio sandbox has some limitations:

| Feature | Sandbox | Paid Number |
|---------|---------|-------------|
| **Who can call** | Only your verified numbers | Anyone |
| **Call duration** | Limited | Unlimited |
| **Custom number** | No (use Twilio's) | Yes |
| **Production use** | No | Yes |

### Adding Numbers to Sandbox

1. Go to **Voice** → **Try it Out** → **Sandbox**
2. Under **Sandbox Participants**, add phone numbers you want to test from
3. Each number will receive a verification call

---

## Security Configuration

### 1. Restrict Callers (Recommended)

Only allow specific phone numbers:

```env
ALLOWED_CALLER_IDS=+14155551234,+14155555678
```

### 2. Enable Webhook Signature Validation

This is **automatic** when `TWILIO_AUTH_TOKEN` is set. Twilio signs every request, and the server validates it.

### 3. Rate Limiting

Default: 10 requests per minute per caller. Adjust in `.env`:

```env
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=10
```

### 4. Input Sanitization

The server automatically filters potential prompt injection attempts.

---

## Connecting to OpenClaw

Instead of direct Claude API calls, route through your OpenClaw instance:

```env
OPENCLAW_WEBHOOK_URL=https://your-openclaw-server/webhook/glasses
OPENCLAW_API_KEY=your_secret_key
```

When configured, all voice queries go through OpenClaw, giving you:
- Access to your OpenClaw skills
- Persistent memory across calls
- MCP tool access
- Unified conversation history

---

## iOS App Integration

The same server handles both Twilio calls and the iOS app.

For the iOS app, use:
- **Webhook URL**: `https://your-domain.com/webhook/glasses`
- **API Key**: Your `WEBHOOK_SECRET` value

---

## Troubleshooting

### "Application error" when calling

1. Check server is running: `curl http://localhost:3456/health`
2. Check ngrok is connected
3. Verify Twilio webhook URL is correct
4. Check server logs for errors

### "Invalid signature" errors

- Make sure `TWILIO_AUTH_TOKEN` matches your Twilio console
- Ensure the webhook URL in Twilio exactly matches what ngrok shows
- If using a proxy, ensure headers are forwarded correctly

### Speech not recognized

- Speak clearly after the greeting
- Wait for the beep/silence before speaking
- Check `SpeechResult` in server logs

### Calls disconnecting immediately

- Check your Twilio account has credit
- Verify webhook URL is accessible
- Look for errors in server logs

---

## Cost Estimates

| Component | Cost |
|-----------|------|
| Twilio incoming call | ~$0.0085/min |
| Twilio speech recognition | ~$0.02/15 seconds |
| Twilio TTS | Included |
| Claude API | ~$0.003/query |

**Estimated cost per minute of conversation**: ~$0.03-0.05

---

## Next Steps

1. **Add ElevenLabs** for better voice quality (see main README)
2. **Set up OpenClaw** for skill access
3. **Deploy to production** (Railway, Render, or your own server)
4. **Get a real Twilio number** for production use

---

## Quick Reference

| What | Command/URL |
|------|-------------|
| Start server | `npm run dev` |
| Health check | `curl http://localhost:3456/health` |
| Twilio Console | https://console.twilio.com |
| Anthropic Console | https://console.anthropic.com |
| ngrok | `ngrok http 3456` |
