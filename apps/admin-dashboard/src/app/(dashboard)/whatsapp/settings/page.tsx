"use client";

import { useEffect, useState } from "react";
import {
  Settings as SettingsIcon,
  AlertCircle,
  Loader2,
  CheckCircle,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { whatsappApi } from "@/lib/api";

export default function WhatsAppSettingsPage() {
  const [config, setConfig] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const c = await whatsappApi.getConfig();
        setConfig(c);
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground/70" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">WhatsApp Settings</h1>
        <p className="text-sm text-muted-foreground">Global WhatsApp platform configuration</p>
      </div>

      {config && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <SettingsIcon className="h-5 w-5" />
              Platform Configuration
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Provider</p>
                <p className="font-medium">{String(config.whatsapp_provider)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">API Version</p>
                <p className="font-medium">{String(config.api_version)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Meta Configured</p>
                <Badge className={config.meta_configured ? "border border-success/25 bg-success/10 text-success" : "border border-warning/25 bg-warning/10 text-warning"}>
                  {config.meta_configured ? "Yes" : "No"}
                </Badge>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Media Upload</p>
                <p className="font-medium">{config.enable_media_upload ? "Enabled" : "Disabled"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Templates</p>
                <p className="font-medium">{config.enable_template_messages ? "Enabled" : "Disabled"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Typing Indicator</p>
                <p className="font-medium">{config.enable_typing_indicator ? "Enabled" : "Disabled"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Session Timeout</p>
                <p className="font-medium">{String(config.session_timeout_minutes)} min</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Max Message Length</p>
                <p className="font-medium">{String(config.max_message_length)} chars</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Media Max Size</p>
                <p className="font-medium">{String(config.media_max_size_mb)} MB</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Info className="h-5 w-5 text-cyan" />
            Meta WhatsApp Cloud API Setup Guide
          </CardTitle>
          <CardDescription>
            Follow these steps to connect your WhatsApp Business account
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="space-y-3 text-sm text-foreground">
            <li className="flex items-start gap-2">
              <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-cyan/15 text-xs text-cyan">1</span>
              <span>Go to <a href="https://developers.facebook.com/apps" target="_blank" rel="noopener noreferrer" className="text-cyan hover:underline">developers.facebook.com/apps</a> and create a new app (type: Business)</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-cyan/15 text-xs text-cyan">2</span>
              <span>Add the <strong>WhatsApp</strong> product to your app</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-cyan/15 text-xs text-cyan">3</span>
              <span>Copy your <strong>WhatsApp Business Account ID</strong>, <strong>Phone Number ID</strong>, and <strong>Access Token</strong> from the dashboard</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-cyan/15 text-xs text-cyan">4</span>
              <span>Set environment variables in your <code>.env</code>:
                <pre className="mt-1 rounded bg-white/[0.03] p-2 text-xs">
{`WHATSAPP_ACCESS_TOKEN=EAAG...
WHATSAPP_PHONE_NUMBER_ID=123456789012345
WHATSAPP_BUSINESS_ACCOUNT_ID=123456789012345
WHATSAPP_VERIFY_TOKEN=your_custom_token
META_APP_SECRET=your_app_secret`}
                </pre>
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-cyan/15 text-xs text-cyan">5</span>
              <span>Configure webhook in Meta dashboard:
                <ul className="mt-1 ml-4 list-disc text-xs">
                  <li>Callback URL: <code>https://your-domain.com/api/v1/whatsapp/webhook</code></li>
                  <li>Verify Token: same as <code>WHATSAPP_VERIFY_TOKEN</code></li>
                  <li>Subscribe to: <code>messages</code>, <code>message_deliveries</code>, <code>message_reads</code></li>
                </ul>
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-cyan/15 text-xs text-cyan">6</span>
              <span>Connect your account in the UI at <strong>/whatsapp/accounts</strong></span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-cyan/15 text-xs text-cyan">7</span>
              <span>Register your phone number at <strong>/whatsapp/accounts</strong> → click the phone icon</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-cyan/15 text-xs text-cyan">8</span>
              <span>Send a WhatsApp message to your business number from your phone to test</span>
            </li>
          </ol>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Local Testing with ngrok</CardTitle>
          <CardDescription>
            Meta can&apos;t reach localhost. Use ngrok to expose your local server.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <pre className="rounded bg-white/[0.03] p-4 text-xs overflow-auto">
{`# Terminal 1: Start backend
cd apps/backend
uvicorn app.main:app --reload --port 8000

# Terminal 2: Start ngrok tunnel
ngrok http 8000
# → Copy the https URL

# Terminal 3: Start frontend
cd apps/frontend
pnpm dev

# Update Meta webhook URL to:
# https://<ngrok-id>.ngrok.io/api/v1/whatsapp/webhook`}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}
