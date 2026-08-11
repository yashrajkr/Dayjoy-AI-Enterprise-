export interface WhatsAppMessage {
  id: string;
  tenantId: string;
  from: string;
  to: string;
  type: 'text' | 'image' | 'video' | 'audio' | 'document' | 'template' | 'interactive' | 'location';
  content: any;
  direction: 'inbound' | 'outbound';
  status: 'queued' | 'sent' | 'delivered' | 'read' | 'failed' | 'received';
  timestamp: Date;
}

export interface WhatsAppWebhookEvent {
  entry: Array<{
    id: string;
    changes: Array<{
      value: {
        messaging_product: 'whatsapp';
        metadata: { display_phone_number: string; phone_number_id: string };
        contacts?: Array<{ profile: { name: string }; wa_id: string }>;
        messages?: Array<any>;
        statuses?: Array<any>;
      };
      field: 'messages';
    }>;
  }>;
}
