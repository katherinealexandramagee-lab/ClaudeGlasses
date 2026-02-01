import express from 'express';
import twilio from 'twilio';
import { config, validateConfig, useElevenLabs } from './config';
import {
  validateTwilioSignature,
  validateCaller,
  rateLimit,
  auditLog,
} from './security';
import {
  getAIResponse,
  clearConversation,
  getGreeting,
  getGoodbye,
} from './ai-service';

const app = express();
const VoiceResponse = twilio.twiml.VoiceResponse;

// Parse URL-encoded bodies (Twilio sends form data)
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// ===========================================
// Health Check (no auth required)
// ===========================================

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'ClaudeGlasses Twilio Webhook',
    timestamp: new Date().toISOString(),
    openClawEnabled: config.openClaw.webhookUrl.length > 0,
    elevenLabsEnabled: useElevenLabs(),
  });
});

// ===========================================
// Twilio Voice Webhooks
// ===========================================

// Apply security middleware to all Twilio routes
const twilioMiddleware = [
  auditLog,
  validateTwilioSignature,
  validateCaller,
  rateLimit,
];

/**
 * POST /voice/incoming
 * Called when someone calls your Twilio number
 */
app.post('/voice/incoming', twilioMiddleware, (req, res) => {
  const twiml = new VoiceResponse();
  const callSid = req.body.CallSid;

  console.log(`📞 Incoming call: ${callSid} from ${req.body.From}`);

  // Greet the caller
  twiml.say(
    { voice: 'Polly.Amy', language: 'en-GB' },
    getGreeting()
  );

  // Start gathering speech
  const gather = twiml.gather({
    input: ['speech'],
    action: '/voice/process',
    method: 'POST',
    speechTimeout: 'auto',
    speechModel: 'phone_call',
    enhanced: true,
    language: 'en-US',
  });

  gather.say(
    { voice: 'Polly.Amy', language: 'en-GB' },
    '' // Silent - just waiting for input
  );

  // If no input, prompt again
  twiml.redirect('/voice/no-input');

  res.type('text/xml');
  res.send(twiml.toString());
});

/**
 * POST /voice/process
 * Called when speech is captured - sends to Claude and responds
 */
app.post('/voice/process', twilioMiddleware, async (req, res) => {
  const twiml = new VoiceResponse();
  const callSid = req.body.CallSid;
  const speechResult = req.body.SpeechResult;
  const confidence = parseFloat(req.body.Confidence || '0');

  console.log(`🎤 Speech received (${confidence.toFixed(2)}): "${speechResult}"`);

  // Check for hang-up commands
  const lowerSpeech = (speechResult || '').toLowerCase();
  if (
    lowerSpeech.includes('goodbye') ||
    lowerSpeech.includes('hang up') ||
    lowerSpeech.includes('end call') ||
    lowerSpeech.includes("that's all")
  ) {
    twiml.say(
      { voice: 'Polly.Amy', language: 'en-GB' },
      getGoodbye()
    );
    twiml.hangup();
    clearConversation(callSid);

    res.type('text/xml');
    res.send(twiml.toString());
    return;
  }

  // Get AI response
  const aiResponse = await getAIResponse(speechResult || '', callSid);

  console.log(`🤖 Claude response: "${aiResponse}"`);

  // Speak the response
  twiml.say(
    { voice: 'Polly.Amy', language: 'en-GB' },
    aiResponse
  );

  // Continue gathering speech for follow-up
  const gather = twiml.gather({
    input: ['speech'],
    action: '/voice/process',
    method: 'POST',
    speechTimeout: 'auto',
    speechModel: 'phone_call',
    enhanced: true,
    language: 'en-US',
  });

  // Prompt for more input
  gather.say(
    { voice: 'Polly.Amy', language: 'en-GB' },
    '' // Silent - waiting for next input
  );

  // If no more input after a while
  twiml.redirect('/voice/no-input');

  res.type('text/xml');
  res.send(twiml.toString());
});

/**
 * POST /voice/no-input
 * Called when no speech detected - prompt or end call
 */
app.post('/voice/no-input', twilioMiddleware, (req, res) => {
  const twiml = new VoiceResponse();
  const callSid = req.body.CallSid;

  // Track no-input count (could use session storage in production)
  const noInputCount = parseInt(req.body.noInputCount || '0', 10) + 1;

  if (noInputCount >= 2) {
    // Too many no-inputs, end call
    twiml.say(
      { voice: 'Polly.Amy', language: 'en-GB' },
      "I haven't heard anything. Goodbye!"
    );
    twiml.hangup();
    clearConversation(callSid);
  } else {
    // Prompt for input
    twiml.say(
      { voice: 'Polly.Amy', language: 'en-GB' },
      "Are you still there? Go ahead, I'm listening."
    );

    const gather = twiml.gather({
      input: ['speech'],
      action: `/voice/process?noInputCount=${noInputCount}`,
      method: 'POST',
      speechTimeout: 'auto',
      speechModel: 'phone_call',
      enhanced: true,
      language: 'en-US',
    });

    gather.say({ voice: 'Polly.Amy', language: 'en-GB' }, '');

    twiml.redirect(`/voice/no-input?noInputCount=${noInputCount}`);
  }

  res.type('text/xml');
  res.send(twiml.toString());
});

/**
 * POST /voice/status
 * Called by Twilio with call status updates
 */
app.post('/voice/status', auditLog, (req, res) => {
  const callSid = req.body.CallSid;
  const callStatus = req.body.CallStatus;

  console.log(`📊 Call ${callSid} status: ${callStatus}`);

  // Clean up conversation history when call ends
  if (callStatus === 'completed' || callStatus === 'failed' || callStatus === 'busy' || callStatus === 'no-answer') {
    clearConversation(callSid);
  }

  res.sendStatus(200);
});

// ===========================================
// iOS App Webhook (for glasses)
// ===========================================

/**
 * POST /webhook/glasses
 * Called by the ClaudeGlasses iOS app
 */
app.post('/webhook/glasses', async (req, res) => {
  // Validate API key if configured
  if (config.security.webhookSecret) {
    const authHeader = req.headers.authorization;
    if (authHeader !== `Bearer ${config.security.webhookSecret}`) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
  }

  const { message, session_id } = req.body;

  if (!message) {
    res.status(400).json({ error: 'Message is required' });
    return;
  }

  try {
    const response = await getAIResponse(message, session_id || 'glasses-default');

    res.json({
      response,
      session_id: session_id || 'glasses-default',
    });
  } catch (error) {
    console.error('Glasses webhook error:', error);
    res.status(500).json({
      response: "Sorry, something went wrong.",
      error: true,
    });
  }
});

// ===========================================
// Start Server
// ===========================================

function startServer() {
  // Validate configuration
  const { valid, errors } = validateConfig();

  if (!valid) {
    console.error('❌ Configuration errors:');
    errors.forEach(e => console.error(`   - ${e}`));
    console.error('\nPlease check your .env file');
    process.exit(1);
  }

  app.listen(config.port, () => {
    console.log('');
    console.log('🦞 ClaudeGlasses Twilio Webhook');
    console.log('================================');
    console.log(`📡 Server running on port ${config.port}`);
    console.log('');
    console.log('Endpoints:');
    console.log(`   GET  /health              - Health check`);
    console.log(`   POST /voice/incoming      - Twilio incoming call`);
    console.log(`   POST /voice/process       - Process speech`);
    console.log(`   POST /voice/status        - Call status updates`);
    console.log(`   POST /webhook/glasses     - iOS app webhook`);
    console.log('');
    console.log('Configuration:');
    console.log(`   OpenClaw: ${config.openClaw.webhookUrl ? '✅ Enabled' : '❌ Disabled (using direct Claude)'}`);
    console.log(`   ElevenLabs: ${useElevenLabs() ? '✅ Enabled' : '❌ Disabled (using Twilio voices)'}`);
    console.log(`   Caller allowlist: ${config.security.allowedCallerIds.length > 0 ? config.security.allowedCallerIds.join(', ') : 'Not configured (all callers allowed)'}`);
    console.log('');
    console.log('Twilio Setup:');
    console.log(`   Set your Twilio phone number's webhook to:`);
    console.log(`   https://your-domain.com/voice/incoming`);
    console.log('');
  });
}

startServer();
