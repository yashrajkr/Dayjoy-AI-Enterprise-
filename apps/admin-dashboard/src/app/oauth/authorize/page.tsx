"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Loader2, Shield, AlertTriangle, CheckCircle2, Lock, Zap } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

function OAuthAuthorizeContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const responseType = searchParams.get("response_type");
  const clientId = searchParams.get("client_id");
  const redirectUri = searchParams.get("redirect_uri");
  const scope = searchParams.get("scope") || "";
  const state = searchParams.get("state");
  const [isAuthorizing, setIsAuthorizing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [appInfo, setAppInfo] = useState<{ name: string; description?: string } | null>(null);

  useEffect(() => {
    if (clientId) {
      setAppInfo({ name: `Application ${clientId.slice(0, 12)}...` });
    }
  }, [clientId]);

  function handleApprove() {
    setIsAuthorizing(true); setError(null);
    try {
      const params = new URLSearchParams({
        response_type: responseType || "code",
        client_id: clientId || "",
        redirect_uri: redirectUri || "",
        scope,
      });
      if (state) params.set("state", state);
      window.location.href = `/api/v1/oauth/authorize?${params.toString()}`;
    } catch (err: unknown) {
      setError((err as { message?: string })?.message || "Authorization failed.");
      setIsAuthorizing(false);
    }
  }

  function handleDeny() {
    if (redirectUri) {
      const sep = redirectUri.includes("?") ? "&" : "?";
      const denyParams = new URLSearchParams({ error: "access_denied" });
      if (state) denyParams.set("state", state);
      window.location.href = `${redirectUri}${sep}${denyParams.toString()}`;
    } else {
      router.push("/dashboard");
    }
  }

  if (!clientId || !redirectUri || responseType !== "code") {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-white/[0.02]">
        <Card className="max-w-md w-full">
          <CardContent className="p-6 text-center">
            <AlertTriangle className="mx-auto h-12 w-12 text-destructive" />
            <h1 className="mt-4 text-xl font-bold text-destructive">Invalid OAuth Request</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Missing required parameters. OAuth 2.0 authorization requires
              <code className="mx-1 px-1 bg-white/[0.04] rounded">response_type=code</code>,
              <code className="mx-1 px-1 bg-white/[0.04] rounded">client_id</code>, and
              <code className="mx-1 px-1 bg-white/[0.04] rounded">redirect_uri</code>.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const scopes = scope.split(" ").filter(Boolean);

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-blue-50 to-indigo-100">
      <Card className="max-w-md w-full shadow-xl">
        <CardHeader className="text-center border-b">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <Shield className="h-8 w-8 text-primary" />
          </div>
          <CardTitle className="text-xl mt-4">Authorize Application</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            <Lock className="inline h-3 w-3 mr-1" />
            DayJoy AI · OAuth 2.0 Authorization
          </p>
        </CardHeader>
        <CardContent className="p-6 space-y-4">
          {appInfo && (
            <div>
              <p className="text-sm text-muted-foreground">
                <strong className="text-foreground">{appInfo.name}</strong> is requesting access to your DayJoy account.
              </p>
            </div>
          )}

          {scopes.length > 0 && (
            <div className="rounded-md border bg-white/[0.02] p-3">
              <p className="text-xs font-semibold text-foreground/80 mb-2 flex items-center gap-1">
                <Zap className="h-3 w-3" /> Requested Permissions
              </p>
              <div className="space-y-1">
                {scopes.map((s) => (
                  <div key={s} className="flex items-center gap-2 text-xs">
                    <CheckCircle2 className="h-3 w-3 text-success" />
                    <code className="font-mono text-foreground/80">{s}</code>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-md bg-warning/10 border border-warning/30 p-3 text-xs text-warning">
            <p>
              <strong>Redirect URI:</strong>
              <code className="block mt-1 p-1 bg-warning/15 rounded break-all">{redirectUri}</code>
            </p>
          </div>

          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
          )}

          <div className="flex gap-2 pt-2">
            <Button onClick={handleApprove} disabled={isAuthorizing} className="flex-1">
              {isAuthorizing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
              Authorize
            </Button>
            <Button onClick={handleDeny} variant="outline" disabled={isAuthorizing} className="flex-1">
              Deny
            </Button>
          </div>

          <p className="text-[10px] text-muted-foreground text-center">
            By authorizing, you grant this application access to perform the listed actions on your behalf.
            You can revoke access at any time from your account settings.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export default function OAuthAuthorizePage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>}>
      <OAuthAuthorizeContent />
    </Suspense>
  );
}
