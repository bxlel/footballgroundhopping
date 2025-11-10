export type Filters = {
  dateFrom: string | null;
  dateTo: string | null;
  country: string;
  city?: string;
};

export type MatchLite = {
  id: string;
  iso?: string;
  date?: string;
  time?: string;
  home?: string;
  away?: string;
  league?: string;
  city?: string;
  venue?: string;
  country?: string;
};

export type CityCount = { city: string; count: number };

export type SearchInfo = {
  from?: string;
  to?: string;
  country?: string;
  city?: string;
  count: number;
};
