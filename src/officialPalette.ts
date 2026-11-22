// Official DOSO auth 01–08 / later-pages unify tokens.
export const officialDark = {
  sheet: '#17191D',
  canvas: '#1C1C1B',
  surface: '#242423',
  field: '#30302F',
  ink: '#E8E8E6',
  muted: '#A0A09B',
  line: '#343432',
  cta: '#F0F4FE',
  ctaInk: '#1C1C1B',
  title: '#EDF2F4',
  lede: '#B9C2CC',
  placeholder: '#6E6E6A',
  statusDot: '#C9D4C4',
  grad: ['#101110', '#171817', '#242423', '#1C1C1B'] as const,
} as const;

export const officialHotspotSsid = 'DOSOrobotics';
export const officialHotspotHost = '192.168.50.1';
export const officialHotspotPort = '13145';
export const officialLabHost = '192.168.66.64';
export const officialLabPort = '13145';

export function isOfficialLabEndpoint(host: string, port: string | number) {
  return host.trim() === officialLabHost && String(port).trim() === officialLabPort;
}
