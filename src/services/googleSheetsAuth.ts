import { AppDatabaseState, PosSaleRow } from '../types';

const GOOGLE_CLIENT_ID_KEY = 'boothbook_google_client_id';
const GOOGLE_TOKEN_KEY = 'boothbook_google_oauth_token';
const DEFAULT_GOOGLE_CLIENT_ID =
  ((import.meta as any).env?.VITE_GOOGLE_CLIENT_ID as string | undefined) || '';

const SCOPES =
  'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email';

const CELL_CHUNK_SIZE = 45000; // Google Sheets จำกัด 50,000 ตัวอักษร/เซลล์

interface StoredGoogleToken {
  accessToken: string;
  expiresAt: number;
  email?: string;
}

export function getGoogleClientId(settingsClientId?: string): string {
  if (DEFAULT_GOOGLE_CLIENT_ID.trim()) return DEFAULT_GOOGLE_CLIENT_ID.trim();
  if (settingsClientId?.trim()) return settingsClientId.trim();
  try {
    return (localStorage.getItem(GOOGLE_CLIENT_ID_KEY) || '').trim();
  } catch {
    return '';
  }
}

export function saveGoogleClientId(clientId: string): void {
  try {
    localStorage.setItem(GOOGLE_CLIENT_ID_KEY, clientId.trim());
  } catch {
    // ignore
  }
}

export function getCachedGoogleToken(): StoredGoogleToken | null {
  try {
    const raw = sessionStorage.getItem(GOOGLE_TOKEN_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredGoogleToken;
    if (!parsed.accessToken || Date.now() >= parsed.expiresAt - 30_000) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function saveCachedGoogleToken(token: StoredGoogleToken): void {
  try {
    sessionStorage.setItem(GOOGLE_TOKEN_KEY, JSON.stringify(token));
  } catch {
    // ignore
  }
}

export function clearCachedGoogleToken(): void {
  try {
    sessionStorage.removeItem(GOOGLE_TOKEN_KEY);
  } catch {
    // ignore
  }
}

/**
 * ขอ Google OAuth Access Token ผ่าน Google Identity Services (ป๊อปอัปล็อกอิน Google 1 คลิก)
 */
export async function requestGoogleAccessToken(
  clientId: string,
  interactive = true
): Promise<{ accessToken: string; email?: string }> {
  const cached = getCachedGoogleToken();
  if (cached) {
    return { accessToken: cached.accessToken, email: cached.email };
  }

  if (!interactive) {
    throw new Error('Google session หมดอายุ กรุณากดยืนยันบัญชี Google อีกครั้ง');
  }

  const trimmedClientId = clientId.trim();
  if (!trimmedClientId) {
    throw new Error(
      'ยังไม่ได้ตั้งค่า Google OAuth Client ID ของแอป (กรุณาใส่ในช่องตั้งค่า Google Client ID ด้านล่าง)'
    );
  }

  const g = (window as any).google;
  if (!g?.accounts?.oauth2) {
    throw new Error('กำลังโหลดระบบ Google Login กรุณารอสักครู่แล้วลองใหม่อีกครั้ง (ต้องเชื่อมต่ออินเทอร์เน็ต)');
  }

  const tokenResp = await new Promise<{ access_token: string; expires_in: number }>((resolve, reject) => {
    const tokenClient = g.accounts.oauth2.initTokenClient({
      client_id: trimmedClientId,
      scope: SCOPES,
      callback: (resp: any) => {
        if (resp?.error) {
          reject(new Error(resp.error_description || resp.error || 'การเข้าสู่ระบบ Google ถูกยกเลิก'));
          return;
        }
        if (!resp?.access_token) {
          reject(new Error('ไม่ได้รับ Access Token จาก Google'));
          return;
        }
        resolve({
          access_token: resp.access_token,
          expires_in: Number(resp.expires_in) || 3500,
        });
      },
    });
    tokenClient.requestAccessToken({ prompt: 'consent' });
  });

  // ดึงอีเมลบัญชี Google ที่ล็อกอินเข้ามาแสดงให้ผู้ใช้เห็น
  let email: string | undefined;
  try {
    const uRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${tokenResp.access_token}` },
    });
    if (uRes.ok) {
      const uData = await uRes.json();
      email = uData?.email;
    }
  } catch {
    // optional
  }

  saveCachedGoogleToken({
    accessToken: tokenResp.access_token,
    expiresAt: Date.now() + tokenResp.expires_in * 1000,
    email,
  });

  return { accessToken: tokenResp.access_token, email };
}

/**
 * 1-Click: ล็อกอิน Google -> สร้างไฟล์ Google Sheet ใหม่ใน Google Drive ของผู้ใช้พร้อม 3 แท็บอัตโนมัติ
 */
export async function connectAndCreateGoogleSheet(
  state: AppDatabaseState,
  clientIdOverride?: string
): Promise<{ spreadsheetId: string; spreadsheetUrl: string; email?: string }> {
  const clientId = getGoogleClientId(clientIdOverride || state.settings.googleClientId);
  const { accessToken, email } = await requestGoogleAccessToken(clientId, true);

  const shopTitle = (state.settings.shopName || 'BoothBook').trim();
  const title = `BoothBook — ${shopTitle}`;

  // 1. สร้าง Spreadsheet ใหม่พร้อม 3 แท็บ (Sales, Events_Summary, BoothBook_DB)
  const createRes = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      properties: { title },
      sheets: [
        {
          properties: {
            title: 'Sales',
            gridProperties: { frozenRowCount: 1 },
          },
        },
        {
          properties: {
            title: 'Events_Summary',
            gridProperties: { frozenRowCount: 1 },
          },
        },
        {
          properties: {
            title: 'BoothBook_DB',
          },
        },
      ],
    }),
  });

  if (!createRes.ok) {
    const errText = await createRes.text();
    throw new Error(`สร้าง Google Sheet ไม่สำเร็จ (${createRes.status}): ${errText}`);
  }

  const created = await createRes.json();
  const spreadsheetId = created.spreadsheetId as string;
  const spreadsheetUrl =
    (created.spreadsheetUrl as string) ||
    `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;

  // 2. เขียนหัวตารางให้แท็บ Sales และ Events_Summary
  const salesHeader = [
    'Order ID',
    'Date',
    'Time',
    'Type',
    'Qty',
    'Item 1',
    'Item 2',
    'Category 1',
    'Category 2',
    'Payment',
    'Promotion',
    'Discount',
    'Amount (THB)',
  ];
  const existingSalesRows: (string | number)[][] = [];
  for (const ev of state.events || []) {
    for (const s of ev.posSales || []) {
      existingSalesRows.push(saleToSheetRow(s));
    }
  }

  await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Sales!A1:M${
      existingSalesRows.length + 1
    }?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        values: [salesHeader, ...existingSalesRows],
      }),
    }
  );

  // 3. เขียนฐานข้อมูลปัจจุบันลงแท็บ BoothBook_DB + Events_Summary
  const updatedState: AppDatabaseState = {
    ...state,
    settings: {
      ...state.settings,
      storageBackend: 'google_sheets',
      sheetId: spreadsheetId,
      googleSheetUrl: spreadsheetUrl,
      googleAccountEmail: email,
    },
  };
  await saveDbSnapshotToGoogleSheet(spreadsheetId, updatedState, accessToken);

  return { spreadsheetId, spreadsheetUrl, email };
}

function saleToSheetRow(sale: PosSaleRow): (string | number)[] {
  return [
    sale.orderId || '',
    sale.date || '',
    sale.time || '',
    sale.type || 'item',
    sale.flavorsPerCup || 1,
    sale.flavor1 || '',
    sale.flavor2 || '',
    sale.category1 || '',
    sale.category2 || '',
    sale.payment || 'QR',
    sale.promotion || '',
    sale.discountAmount || 0,
    sale.amount || 0,
  ];
}

/** เพิ่มออเดอร์ POS 1 แถวลงแท็บ Sales ผ่าน Google Sheets API v4 โดยตรง */
export async function appendSaleRowToGoogleSheet(
  spreadsheetId: string,
  sale: PosSaleRow,
  accessTokenOverride?: string
): Promise<boolean> {
  const token = accessTokenOverride || getCachedGoogleToken()?.accessToken;
  if (!spreadsheetId || !token) return false;

  try {
    const res = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Sales!A:M:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          values: [saleToSheetRow(sale)],
        }),
      }
    );
    return res.ok;
  } catch {
    return false;
  }
}

/** บันทึกสถานะฐานข้อมูลทั้งหมดลงแท็บ BoothBook_DB (แบ่ง chunk กันเกินลิมิตเซลล์) + อัปเดต Events_Summary */
export async function saveDbSnapshotToGoogleSheet(
  spreadsheetId: string,
  state: AppDatabaseState,
  accessTokenOverride?: string
): Promise<boolean> {
  const token = accessTokenOverride || getCachedGoogleToken()?.accessToken;
  if (!spreadsheetId || !token) return false;

  try {
    const json = JSON.stringify(state);
    const chunks: string[][] = [];
    for (let i = 0; i < json.length; i += CELL_CHUNK_SIZE) {
      chunks.push([json.slice(i, i + CELL_CHUNK_SIZE)]);
    }
    if (chunks.length === 0) chunks.push(['{}']);

    // ล้างค่าเก่าในคอลัมน์ A ก่อนแล้วเขียน chunk ใหม่
    await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/BoothBook_DB!A:A:clear`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    const dbRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/BoothBook_DB!A1:A${chunks.length}?valueInputOption=RAW`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ values: chunks }),
      }
    );

    // อัปเดตแท็บ Events_Summary เพื่อให้เจ้าของร้านเปิดดูสรุปบูธง่ายๆ ใน Sheet
    const summaryRows: (string | number)[][] = [
      ['Event Name', 'Location', 'Start Date', 'End Date', 'Status', 'Total Orders', 'Gross Revenue (THB)'],
      ...(state.events || []).map((ev) => [
        ev.name || '',
        ev.location || '',
        ev.startDate || '',
        ev.endDate || '',
        ev.status || '',
        ev.posSales?.length || 0,
        (ev.posSales || []).reduce((s, r) => s + (Number(r.amount) || 0), 0),
      ]),
    ];

    await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Events_Summary!A1:G${summaryRows.length}?valueInputOption=USER_ENTERED`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ values: summaryRows }),
      }
    );

    return dbRes.ok;
  } catch {
    return false;
  }
}

/** ดึงสถานะฐานข้อมูลทั้งหมดกลับมาจากแท็บ BoothBook_DB */
export async function loadDbSnapshotFromGoogleSheet(
  spreadsheetId: string,
  accessTokenOverride?: string
): Promise<AppDatabaseState | null> {
  const token = accessTokenOverride || getCachedGoogleToken()?.accessToken;
  if (!spreadsheetId || !token) return null;

  try {
    const res = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/BoothBook_DB!A:A`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const rows = data?.values as string[][] | undefined;
    if (!Array.isArray(rows) || rows.length === 0) return null;
    const joined = rows.map((r) => r[0] || '').join('');
    if (!joined) return null;
    const parsed = JSON.parse(joined) as AppDatabaseState;
    return parsed && Array.isArray(parsed.recipes) ? parsed : null;
  } catch {
    return null;
  }
}
