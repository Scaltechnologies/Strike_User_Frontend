// Mirrors admin-service's BannerResponse (strike-admin-panel's banner.types.ts),
// trimmed to the fields the app actually needs to render one. The backend's
// "active" list endpoint is expected to have already filtered on
// active/startDate/endDate — the app doesn't re-check those here.

export interface Banner {
  id: number;
  title: string;
  imageUrl: string;
  linkUrl: string | null;
  displayOrder: number;
}
