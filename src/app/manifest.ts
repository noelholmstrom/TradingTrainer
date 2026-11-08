import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'TradingTrainer',
    short_name: 'TradingTrainer',
    description: 'Replay Nasdaq-100 futures sessions and practise trading them, with coaching and stats.',
    start_url: '/replay',
    scope: '/',
    display: 'standalone',
    background_color: '#0b0f16',
    theme_color: '#0b0f16',
    categories: ['education', 'finance'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
    ]
  };
}
