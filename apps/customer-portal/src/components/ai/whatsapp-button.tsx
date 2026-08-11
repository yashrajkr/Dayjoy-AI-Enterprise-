"use client";

import { useState } from "react";
import { MessageCircle, X, QrCode, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { WHATSAPP_NUMBER } from "@/lib/constants";
import { cn } from "@/lib/utils";

interface WhatsAppButtonProps {
  /** Pre-filled message body for the WhatsApp deep link. */
  prefillMessage?: string;
  /** Display phone number override (defaults to env var). */
  phoneNumber?: string;
  label?: string;
  className?: string;
  variant?: "floating" | "inline";
}

/**
 * WhatsApp chat button — opens a modal with two ways to reach
 * Dayjoy support on WhatsApp:
 *   1. A one-tap "Open WhatsApp" deep link (`wa.me/<n>?text=<msg>`).
 *   2. A scannable QR code (generated from a public chart API) for
 *      customers on desktop who want to continue on their phone.
 */
export function WhatsAppButton({
  prefillMessage = "Hi Dayjoy! I have a question about my account.",
  phoneNumber = WHATSAPP_NUMBER,
  label = "WhatsApp",
  className,
  variant = "inline",
}: WhatsAppButtonProps) {
  const [open, setOpen] = useState(false);

  const waLink = `https://wa.me/${phoneNumber.replace(/[^0-9]/g, "")}?text=${encodeURIComponent(
    prefillMessage,
  )}`;

  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(
    waLink,
  )}`;

  return (
    <>
      {variant === "floating" ? (
        <Button
          onClick={() => setOpen(true)}
          size="icon"
          className={cn(
            "fixed bottom-6 right-24 z-40 h-14 w-14 rounded-full bg-[#25D366] text-white hover:bg-[#1ebe57]",
            className,
          )}
          aria-label="Chat with us on WhatsApp"
        >
          <MessageCircle className="h-5 w-5" />
        </Button>
      ) : (
        <Button
          onClick={() => setOpen(true)}
          variant="outline"
          className={cn("gap-2 border-[#25D366]/40 text-[#1ebe57] hover:bg-[#25D366]/10", className)}
        >
          <MessageCircle className="h-4 w-4" />
          {label}
        </Button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-[#25D366] text-white">
                <MessageCircle className="h-4 w-4" />
              </span>
              Chat on WhatsApp
            </DialogTitle>
            <DialogDescription>
              Reach our support team on WhatsApp — typically replies within
              10 minutes during business hours (9 AM – 8 PM IST).
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="link">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="link" className="gap-1.5">
                <ExternalLink className="h-3.5 w-3.5" />
                Open link
              </TabsTrigger>
              <TabsTrigger value="qr" className="gap-1.5">
                <QrCode className="h-3.5 w-3.5" />
                Scan QR
              </TabsTrigger>
            </TabsList>

            <TabsContent value="link" className="space-y-3">
              <div className="rounded-lg border border-border bg-muted/50 p-3 text-sm">
                <p className="text-xs font-medium text-muted-foreground">
                  Pre-filled message:
                </p>
                <p className="mt-1 text-foreground">{prefillMessage}</p>
              </div>
              <Button asChild className="w-full gap-2 bg-[#25D366] text-white hover:bg-[#1ebe57]">
                <a
                  href={waLink}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <MessageCircle className="h-4 w-4" />
                  Open WhatsApp
                </a>
              </Button>
            </TabsContent>

            <TabsContent value="qr" className="space-y-3">
              <div className="flex flex-col items-center gap-3 py-2">
                <div className="rounded-xl border border-border bg-white p-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={qrSrc}
                    alt="WhatsApp chat QR code"
                    width={200}
                    height={200}
                    className="h-[200px] w-[200px]"
                  />
                </div>
                <p className="text-center text-xs text-muted-foreground">
                  Scan with your phone camera to start a WhatsApp chat with
                  Dayjoy support.
                </p>
              </div>
            </TabsContent>
          </Tabs>

          <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
            <p className="font-medium text-foreground">Business hours</p>
            <p className="mt-1">
              Mon – Sat, 9:00 AM – 8:00 PM IST. Messages outside business
              hours will be answered the next working day.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
