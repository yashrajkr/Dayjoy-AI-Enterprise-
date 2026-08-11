"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Play,
  Download,
  Clock,
  RefreshCw,
  AlertCircle,
  Loader2,
  FileAudio,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { telephonyApi, type CallRecording } from "@/lib/api";

export default function RecordingsPage() {
  const [recordings, setRecordings] = useState<CallRecording[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await telephonyApi.listRecordings({ limit: 50 });
      setRecordings(res.recordings);
      setTotal(res.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load recordings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Call Recordings</h1>
          <p className="text-sm text-muted-foreground">{total} total recordings</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground/70" />
        </div>
      ) : recordings.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FileAudio className="mx-auto h-12 w-12 text-muted-foreground/50" />
            <p className="mt-2 text-sm text-muted-foreground">No recordings available</p>
            <p className="mt-1 text-xs text-muted-foreground/70">
              Enable recording on your phone numbers to start collecting call recordings
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {recordings.map((r) => (
            <Card key={r.id}>
              <CardContent className="pt-6">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo/10">
                      <FileAudio className="h-5 w-5 text-indigo" />
                    </div>
                    <div>
                      <p className="text-sm font-medium font-mono">{r.recording_sid.slice(0, 16)}...</p>
                      <p className="text-xs text-muted-foreground">
                        {Math.floor(r.duration_seconds / 60)}m {r.duration_seconds % 60}s
                      </p>
                    </div>
                  </div>
                  <Badge className={r.status === "completed" ? "border border-success/25 bg-success/10 text-success" : "border border-warning/25 bg-warning/10 text-warning"}>
                    {r.status}
                  </Badge>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <p className="text-muted-foreground">Format</p>
                    <p className="font-medium uppercase">{r.format}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Channels</p>
                    <p className="font-medium uppercase">{r.channels}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Access</p>
                    <p className="font-medium">{r.access_level}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Consent</p>
                    <p className="font-medium">{r.consent_obtained ? "Yes" : "No"}</p>
                  </div>
                </div>
                <div className="mt-4 flex gap-2">
                  <a href={r.url} target="_blank" rel="noopener noreferrer" className="flex-1">
                    <Button variant="outline" size="sm" className="w-full">
                      <Play className="mr-2 h-4 w-4" />
                      Play
                    </Button>
                  </a>
                  <a href={r.url} download className="flex-1">
                    <Button variant="outline" size="sm" className="w-full">
                      <Download className="mr-2 h-4 w-4" />
                      Download
                    </Button>
                  </a>
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  <Clock className="mr-1 inline h-3 w-3" />
                  {r.created_at ? new Date(r.created_at).toLocaleString() : "—"}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
