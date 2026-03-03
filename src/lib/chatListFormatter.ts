function toLocalDateKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function formatLocalDate(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function formatLocalTime(date: Date): string {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`;
}

export interface ChatInfo {
  firstAgentName?: string;
  firstAgentKey?: string;
  chatName?: string;
  chatId?: string;
  updatedAt?: string | number | Date;
}

export function pickChatAgentLabel(chat: ChatInfo): string {
  const firstAgentName = String(chat?.firstAgentName || '').trim();
  if (firstAgentName) {
    return firstAgentName;
  }

  const firstAgentKey = String(chat?.firstAgentKey || '').trim();
  if (firstAgentKey) {
    return firstAgentKey;
  }

  return 'n/a';
}

export function formatChatTimeLabel(updatedAt: string | number | Date | undefined, nowDate: Date = new Date()): string {
  if (!updatedAt) {
    return '--';
  }

  const updatedDate = new Date(updatedAt);
  if (Number.isNaN(updatedDate.getTime())) {
    return '--';
  }

  const now = nowDate instanceof Date ? nowDate : new Date(nowDate);
  if (Number.isNaN(now.getTime())) {
    return formatLocalDate(updatedDate);
  }

  return toLocalDateKey(updatedDate) === toLocalDateKey(now)
    ? formatLocalTime(updatedDate)
    : formatLocalDate(updatedDate);
}
