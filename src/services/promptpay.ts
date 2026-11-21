import QRCode from 'qrcode';

export function generatePromptPayPayload(id: string, amount: number): string {
  const cleanId = id.replace(/\D/g, '');
  const f = (t: string, v: string) => t + String(v.length).padStart(2, '0') + v;
  const acc =
    cleanId.length >= 13 ? f('02', cleanId) : f('01', '0066' + cleanId.replace(/^0/, ''));
  const p =
    f('00', '01') +
    f('01', '12') +
    f('29', f('00', 'A000000677010111') + acc) +
    f('58', 'TH') +
    f('53', '764') +
    f('54', amount.toFixed(2)) +
    '6304';
  let c = 0xffff;
  for (let i = 0; i < p.length; i++) {
    c ^= p.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      c = c & 0x8000 ? ((c << 1) ^ 0x1021) & 0xffff : (c << 1) & 0xffff;
    }
  }
  return p + c.toString(16).toUpperCase().padStart(4, '0');
}

export async function generateQrDataUrl(payload: string): Promise<string> {
  return await QRCode.toDataURL(payload, {
    margin: 2,
    scale: 6,
    color: {
      dark: '#0d3a57',
      light: '#ffffff',
    },
  });
}
