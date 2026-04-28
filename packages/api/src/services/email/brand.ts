export interface Brand {
  name: string
  tagline: string
  domain: string
  contactEmail: string
  fromAddress: string
  logoUrl: string
  palette: {
    bg: string
    surface: string
    text: string
    muted: string
    headerBg: string
    headerFg: string
    footerBg: string
    footerFg: string
    primary: string
    accent: string
    panel: string
    border: string
  }
}

export const brand: Brand = {
  name: 'CNX AthletX',
  tagline: 'Plant-Based Protein, Chiang Mai',
  domain: 'www.cnxnature.com',
  contactEmail: 'orders@cnxnature.com',
  fromAddress: 'CNX AthletX <orders@cnxnature.com>',
  logoUrl: 'https://www.cnxnature.com/email-mark.png?v=3',
  palette: {
    bg: '#F2EDE4',
    surface: '#ffffff',
    text: '#2E2B26',
    muted: '#555',
    headerBg: '#2E2B26',
    headerFg: '#E5DDD0',
    footerBg: '#252320',
    footerFg: '#8B8580',
    primary: '#8B9A7B',
    accent: '#B53A32',
    panel: '#F2EDE4',
    border: '#E8E2D8',
  },
}
