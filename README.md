# Claude Glasses

iOS app integrating Claude AI with Ray-Ban Meta smart glasses for hands-free voice assistance.

**Now with Twilio voice support** - call in from any phone!

## Features

- **Wake Word Detection**: Say "Hey Claude" to activate
- **Voice Transcription**: On-device speech-to-text using WhisperKit
- **Claude AI Integration**: Send queries to Claude API or OpenClaw
- **Audio Playback**: Hear responses through your glasses speakers
- **Twilio Voice**: Call your Claude assistant from any phone

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      TWO INPUT OPTIONS                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Option 1: Meta Glasses          Option 2: Phone Call            │
│  ┌─────────────────┐             ┌─────────────────┐            │
│  │ "Hey Claude..." │             │ 📞 Call Twilio  │            │
│  │   (via iOS app) │             │    number       │            │
│  └────────┬────────┘             └────────┬────────┘            │
│           │                               │                      │
│           └───────────┬───────────────────┘                      │
│                       │                                          │
│                       ▼                                          │
│              ┌─────────────────┐                                │
│              │  Twilio Webhook │                                │
│              │     Server      │                                │
│              └────────┬────────┘                                │
│                       │                                          │
│           ┌───────────┴───────────┐                             │
│           │                       │                              │
│           ▼                       ▼                              │
│  ┌─────────────────┐    ┌─────────────────┐                    │
│  │   Direct Claude │    │    OpenClaw     │                    │
│  │       API       │    │  (with skills)  │                    │
│  └─────────────────┘    └─────────────────┘                    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Requirements

### For Glasses (iOS App)
- iOS 15.0+
- Xcode 15.0+
- Ray-Ban Meta smart glasses
- Anthropic API key

### For Phone Calls (Twilio)
- Node.js 18+
- Twilio account (sandbox works for testing)
- Anthropic API key
- Public URL (ngrok, Cloudflare Tunnel, etc.)

## Quick Start

### Option 1: Use with Glasses

1. Clone the repository
2. Open in Xcode
3. Configure your API key in Config.swift
4. Build and run on your iPhone
5. Pair your Meta glasses via the Meta View app
6. Say "Hey Claude" and ask anything!

### Option 2: Use via Phone

```bash
cd twilio-webhook
npm install
cp .env.example .env
# Edit .env with your credentials
npm run dev
```

Then configure your Twilio number to point to your webhook.

See [twilio-webhook/SETUP.md](twilio-webhook/SETUP.md) for detailed instructions.

## Project Structure

```
ClaudeGlasses/
├── ClaudeGlasses/
│   └── Sources/
│       ├── App/
│       │   └── ClaudeGlassesApp.swift
│       ├── Services/
│       │   ├── ClaudeAPIService.swift
│       │   ├── GlassesConnectionService.swift
│       │   ├── TextToSpeechService.swift
│       │   ├── TranscriptionService.swift
│       │   └── WakeWordService.swift
│       └── Utils/
│           └── Config.swift
│
├── twilio-webhook/              # NEW: Twilio voice integration
│   ├── src/
│   │   ├── server.ts           # Express server
│   │   ├── ai-service.ts       # Claude/OpenClaw integration
│   │   ├── security.ts         # Auth & validation
│   │   └── config.ts           # Configuration
│   ├── .env.example            # Environment template
│   ├── SETUP.md                # Detailed setup guide
│   └── package.json
│
├── Package.swift
└── README.md
```

## Security

The Twilio webhook includes:
- **Signature validation**: Verifies requests are from Twilio
- **Caller allowlist**: Restrict who can call
- **Rate limiting**: Prevent abuse
- **Input sanitization**: Filter prompt injection attempts

See [twilio-webhook/SETUP.md](twilio-webhook/SETUP.md) for security configuration.

## OpenClaw Integration

Both the iOS app and Twilio webhook can route through OpenClaw for:
- Access to your configured skills
- Persistent conversation memory
- MCP tool access

Set `OPENCLAW_WEBHOOK_URL` in your `.env` to enable.

## Cost Estimates

| Component | Cost |
|-----------|------|
| **Glasses (iOS app)** | |
| Speech-to-text | Free (on-device) |
| Claude API | ~$0.003/query |
| iOS TTS | Free |
| | |
| **Phone (Twilio)** | |
| Incoming call | ~$0.0085/min |
| Speech recognition | ~$0.02/15 sec |
| Claude API | ~$0.003/query |

## License

MIT License
