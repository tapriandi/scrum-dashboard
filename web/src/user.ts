const KEY = 'scrum-dashboard-user';

export function getUser(): string {
  let u = localStorage.getItem(KEY);
  while (!u || !u.trim()) {
    u = window.prompt('Your name (shown in the change log):');
    if (u?.trim()) localStorage.setItem(KEY, u.trim());
  }
  return u.trim();
}

export function setUser(name: string): void {
  localStorage.setItem(KEY, name.trim());
}
