import { ChannelItem, MediaItem } from '../types';

export const FEATURED_BANNER: MediaItem = {
  id: 'feat-1',
  tmdbId: 1022789,
  title: 'Kalki 2898 AD',
  overview: 'A modern avatar of Vishnu descends to Earth to protect the world from evil forces in a dystopian post-apocalyptic future.',
  posterUrl: 'https://image.tmdb.org/t/p/w500/9Pfqr51uB7QsmfL6GgQe1s2O84D.jpg',
  backdropUrl: 'https://image.tmdb.org/t/p/w1280/siA1VzXm9Zz3U8Z05KzX68w0fXN.jpg',
  releaseYear: '2024',
  rating: 8.2,
  type: 'movie',
  category: 'Bollywood',
  genres: ['Sci-Fi', 'Action', 'Mythology'],
  duration: '3h 01m',
  streamUrl: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8'
};

export const BOLLYWOOD_MOVIES: MediaItem[] = [
  {
    id: 'boll-1',
    tmdbId: 872585,
    title: 'Oppenheimer (Hindi)',
    overview: 'The story of J. Robert Oppenheimer’s role in the development of the atomic bomb during World War II.',
    posterUrl: 'https://image.tmdb.org/t/p/w500/8Gxv8gSFCU0XGDykEGv7zR1n2ua.jpg',
    backdropUrl: 'https://image.tmdb.org/t/p/w1280/fm6KqXpk3M2HVveHwCrBSSBaO0V.jpg',
    releaseYear: '2023',
    rating: 8.9,
    type: 'movie',
    category: 'Bollywood',
    genres: ['Drama', 'History', 'Biography'],
    duration: '3h 00m',
    streamUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4'
  },
  {
    id: 'boll-2',
    tmdbId: 866398,
    title: 'Jawan',
    overview: 'A high-octane action thriller outlining the emotional journey of a man who is set out to rectify the wrongs in society.',
    posterUrl: 'https://image.tmdb.org/t/p/w500/jNQ3f2y00mSj2P95kM94nK82b2n.jpg',
    backdropUrl: 'https://image.tmdb.org/t/p/w1280/hZkgoQYus5vegHoetLkCJzb17zJ.jpg',
    releaseYear: '2023',
    rating: 8.1,
    type: 'movie',
    category: 'Bollywood',
    genres: ['Action', 'Thriller'],
    duration: '2h 49m',
    streamUrl: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8'
  },
  {
    id: 'boll-3',
    tmdbId: 787781,
    title: 'Animal',
    overview: 'A son undergoes a remarkable transformation as the bond with his father begins to fracture, and he sets out on a path of vengeance.',
    posterUrl: 'https://image.tmdb.org/t/p/w500/hr9rjR4J071qU6yO69WfS1A6Ksm.jpg',
    backdropUrl: 'https://image.tmdb.org/t/p/w1280/4HodYYKEIsGOdinkGi2Ucz6X9i0.jpg',
    releaseYear: '2023',
    rating: 7.8,
    type: 'movie',
    category: 'Bollywood',
    genres: ['Action', 'Crime', 'Drama'],
    duration: '3h 21m',
    streamUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4'
  },
  {
    id: 'boll-4',
    tmdbId: 1184918,
    title: 'Stree 2: Sarkate Ka Aatank',
    overview: 'After the events of Stree, the town of Chanderi is being haunted again by a new headless ghost named Sarkata.',
    posterUrl: 'https://image.tmdb.org/t/p/w500/m1z4v2gU3fWzYdF3r4WvA9S2d4r.jpg',
    backdropUrl: 'https://image.tmdb.org/t/p/w1280/8Y43POKjjKDGI9MH89NW0NAAcZl.jpg',
    releaseYear: '2024',
    rating: 7.9,
    type: 'movie',
    category: 'Bollywood',
    genres: ['Comedy', 'Horror'],
    duration: '2h 27m',
    streamUrl: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8'
  },
  {
    id: 'boll-5',
    tmdbId: 1113278,
    title: '12th Fail',
    overview: 'Based on the true story of Manoj Kumar Sharma who overcame extreme poverty to become an Indian Police Service officer.',
    posterUrl: 'https://image.tmdb.org/t/p/w500/y798H06c7S17w93kE1p39z59H29.jpg',
    backdropUrl: 'https://image.tmdb.org/t/p/w1280/x2RS3uT099v489e3H82hF8S9k9W.jpg',
    releaseYear: '2023',
    rating: 9.2,
    type: 'movie',
    category: 'Bollywood',
    genres: ['Drama', 'Biography'],
    duration: '2h 27m',
    streamUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4'
  },
  {
    id: 'boll-6',
    tmdbId: 579974,
    title: 'RRR (Rise Roar Revolt)',
    overview: 'A fearless warrior on a perilous mission comes face to face with a steely cop serving British forces in pre-independent India.',
    posterUrl: 'https://image.tmdb.org/t/p/w500/nEufeZlyAOLqO2brrs0ye2Nw0XO.jpg',
    backdropUrl: 'https://image.tmdb.org/t/p/w1280/g049b1L8p95B0eP03sA4k2f7l0w.jpg',
    releaseYear: '2022',
    rating: 8.8,
    type: 'movie',
    category: 'Bollywood',
    genres: ['Action', 'Drama'],
    duration: '3h 07m',
    streamUrl: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8'
  }
];

export const HOLLYWOOD_MOVIES: MediaItem[] = [
  {
    id: 'holly-1',
    tmdbId: 693134,
    title: 'Dune: Part Two',
    overview: 'Paul Atreides unites with Chani and the Fremen while seeking revenge against the conspirators who destroyed his family.',
    posterUrl: 'https://image.tmdb.org/t/p/w500/1pdfLvkbY9ohJlCjQH2CZjjYVvJ.jpg',
    backdropUrl: 'https://image.tmdb.org/t/p/w1280/xOMo8BRK7PfcJv9JCnx7s5hj0x2.jpg',
    releaseYear: '2024',
    rating: 8.7,
    type: 'movie',
    category: 'Hollywood',
    genres: ['Sci-Fi', 'Adventure'],
    duration: '2h 46m',
    streamUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4'
  },
  {
    id: 'holly-2',
    tmdbId: 533535,
    title: 'Deadpool & Wolverine',
    overview: 'A listless Wade Wilson toils away in civilian life with his days as the morally flexible mercenary behind him, until the TVA recruits him.',
    posterUrl: 'https://image.tmdb.org/t/p/w500/8cdWjvZQUExUUTzyp4t6EDMubfO.jpg',
    backdropUrl: 'https://image.tmdb.org/t/p/w1280/yD3rF2hJ7bQzW2A4k8p5Y3qZ2q8.jpg',
    releaseYear: '2024',
    rating: 8.0,
    type: 'movie',
    category: 'Hollywood',
    genres: ['Action', 'Comedy', 'Sci-Fi'],
    duration: '2h 08m',
    streamUrl: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8'
  },
  {
    id: 'holly-3',
    tmdbId: 569094,
    title: 'Spider-Man: Across the Spider-Verse',
    overview: 'Miles Morales catapults across the Multiverse, where he encounters a team of Spider-People charged with protecting its very existence.',
    posterUrl: 'https://image.tmdb.org/t/p/w500/8Vt6mWEReuy4Of61Lnj5Xj704m8.jpg',
    backdropUrl: 'https://image.tmdb.org/t/p/w1280/4HodYYKEIsGOdinkGi2Ucz6X9i0.jpg',
    releaseYear: '2023',
    rating: 8.9,
    type: 'movie',
    category: 'Hollywood',
    genres: ['Animation', 'Action', 'Adventure'],
    duration: '2h 20m',
    streamUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4'
  },
  {
    id: 'holly-4',
    tmdbId: 157336,
    title: 'Interstellar',
    overview: 'The adventures of a group of explorers who make use of a newly discovered wormhole to surpass the limitations on human space travel.',
    posterUrl: 'https://image.tmdb.org/t/p/w500/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg',
    backdropUrl: 'https://image.tmdb.org/t/p/w1280/xJHokMbljvjADYdit5fK5VQsXEG.jpg',
    releaseYear: '2014',
    rating: 8.7,
    type: 'movie',
    category: 'Hollywood',
    genres: ['Sci-Fi', 'Drama'],
    duration: '2h 49m',
    streamUrl: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8'
  },
  {
    id: 'holly-5',
    tmdbId: 155,
    title: 'The Dark Knight',
    overview: 'Batman raises the stakes in his war on crime with the help of Lt. Jim Gordon and District Attorney Harvey Dent, until the Joker arrives.',
    posterUrl: 'https://image.tmdb.org/t/p/w500/qJ2tW6WMUDux911r6m7haRef0WH.jpg',
    backdropUrl: 'https://image.tmdb.org/t/p/w1280/dqK9Hag1054tghRQSqLSfrkvQnA.jpg',
    releaseYear: '2008',
    rating: 9.0,
    type: 'movie',
    category: 'Hollywood',
    genres: ['Action', 'Crime', 'Drama'],
    duration: '2h 32m',
    streamUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4'
  }
];

export const WEB_SERIES: MediaItem[] = [
  {
    id: 'series-1',
    tmdbId: 83584,
    title: 'Mirzapur',
    overview: 'The iron-fisted Akhandanand Tripathi is a millionaire carpet exporter and the mafia don of Mirzapur.',
    posterUrl: 'https://image.tmdb.org/t/p/w500/z6hWfKz9WzWd3A8k6p3j7y8k8z.jpg',
    backdropUrl: 'https://image.tmdb.org/t/p/w1280/2OMG2b9LecVn9lY7eC7H8mY8sS9.jpg',
    releaseYear: '2024',
    rating: 8.5,
    type: 'tv',
    category: 'Web Series',
    genres: ['Crime', 'Action', 'Drama'],
    duration: 'Season 3',
    streamUrl: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8'
  },
  {
    id: 'series-2',
    tmdbId: 98118,
    title: 'Panchayat',
    overview: 'An engineering graduate joins as a Panchayat secretary in a remote fictional village of Phulera in Uttar Pradesh due to lack of better job options.',
    posterUrl: 'https://image.tmdb.org/t/p/w500/1hQ1u4A2L0W7y5K4n7e7j9y6z2a.jpg',
    backdropUrl: 'https://image.tmdb.org/t/p/w1280/wZ8B9h1k4N7M3K8f5A1s4D6h8J0.jpg',
    releaseYear: '2024',
    rating: 9.0,
    type: 'tv',
    category: 'Web Series',
    genres: ['Comedy', 'Drama'],
    duration: 'Season 3',
    streamUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4'
  },
  {
    id: 'series-3',
    tmdbId: 66732,
    title: 'Stranger Things',
    overview: 'When a young boy vanishes, a small town uncovers a mystery involving secret experiments, terrifying supernatural forces and one strange little girl.',
    posterUrl: 'https://image.tmdb.org/t/p/w500/49WJfeN0moxb9IPfGn8AIqMGskD.jpg',
    backdropUrl: 'https://image.tmdb.org/t/p/w1280/56v2KjBlU4XaOv9rVYEQypROD7P.jpg',
    releaseYear: '2022',
    rating: 8.6,
    type: 'tv',
    category: 'Web Series',
    genres: ['Sci-Fi', 'Mystery', 'Horror'],
    duration: 'Season 4',
    streamUrl: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8'
  },
  {
    id: 'series-4',
    tmdbId: 76479,
    title: 'The Boys',
    overview: 'A fun and irreverent take on what happens when superheroes abuse their superpowers rather than use them for good.',
    posterUrl: 'https://image.tmdb.org/t/p/w500/7Ns6tO3aYjppI5m1gXq3fN3fQ2z.jpg',
    backdropUrl: 'https://image.tmdb.org/t/p/w1280/muth4A4rU9v4Y5T9d0wX2b3j8K9.jpg',
    releaseYear: '2024',
    rating: 8.5,
    type: 'tv',
    category: 'Web Series',
    genres: ['Action', 'Sci-Fi', 'Satire'],
    duration: 'Season 4',
    streamUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4'
  }
];

export const LIVE_CHANNELS: ChannelItem[] = [
  // --- SPORTS & CRICKET ---
  {
    id: 'cricket-willow-hd',
    name: 'Willow Sports HD (Cricket)',
    logo: 'https://cricket.willow.tv/_nuxt/img/willow_blue_logo.362ed8e.png',
    category: 'Sports',
    streamUrl: 'https://d36r8jifhgsk5j.cloudfront.net/Willow_TV1080p.m3u8',
    country: 'USA / Global',
    quality: '1080p'
  },
  {
    id: 'cricket-willow-live',
    name: 'Willow Cricket Live',
    logo: 'https://provider-static.plex.tv/epg/cms/production/acf3d1d8-c53e-49ca-86e9-0d9410b106b4/Willow_Sports_dark_Background_1500_1000_color.png',
    category: 'Sports',
    streamUrl: 'https://d36r8jifhgsk5j.cloudfront.net/Willow_TV.m3u8',
    country: 'USA / India',
    quality: '720p'
  },
  {
    id: 'cricket-gold-hd',
    name: 'Cricket Gold (24/7 Cricket HD)',
    logo: 'https://resources.cricket-australia.pulselive.com/cricket-australia/photo/2025/07/25/836eddae-4329-4542-ad17-dcd37e9d951a/Cricket-Gold-1920x1080_noBG.png',
    category: 'Sports',
    streamUrl: 'https://streams2.sofast.tv/ptnr-yupptv/title-cricketgold/v1/master/611d79b11b77e2f571934fd80ca1413453772ac7/b2048bb8-1686-4432-aa50-647245383e0c/manifest.m3u8',
    country: 'Australia / Global',
    quality: '1080p'
  },
  {
    id: 'cricket-sony-ten-1-hd',
    name: 'Sony Sports Ten 1 HD',
    logo: 'https://xstreamcp-assets-msp.streamready.in/assets/LIVETV/LIVECHANNEL/LIVETV_LIVETVCHANNEL_SONY_SPORTS_TEN_1/images/LOGO_HD/image.png',
    category: 'Sports',
    streamUrl: 'http://103.185.24.134:3001/SonyTenSports1/index.m3u8',
    country: 'India',
    quality: '1080p'
  },
  {
    id: 'cricket-sony-ten-2',
    name: 'Sony Sports Ten 2',
    logo: 'https://xstreamcp-assets-msp.streamready.in/assets/LIVETV/LIVECHANNEL/LIVETV_LIVETVCHANNEL_SONY_SPORTS_TEN_2/images/LOGO_HD/image.png',
    category: 'Sports',
    streamUrl: 'http://103.151.60.162:2122/play/a01b/index.m3u8?hls',
    country: 'India',
    quality: '720p'
  },
  {
    id: 'cricket-sony-ten-3-hindi',
    name: 'Sony Sports Ten 3 Hindi',
    logo: 'https://dtil.tmsimg.com/assets/GNLZZGG0025TCMR.png?lock=720x540',
    category: 'Sports',
    streamUrl: 'http://103.151.60.162:2122/play/a01t/index.m3u8?hls',
    country: 'India',
    quality: '720p'
  },
  {
    id: 'cricket-sony-ten-5',
    name: 'Sony Sports Ten 5',
    logo: 'https://xstreamcp-assets-msp.streamready.in/assets/LIVETV/LIVECHANNEL/LIVETV_LIVETVCHANNEL_SONY_SPORTS_TEN_5/images/LOGO_HD/image.png',
    category: 'Sports',
    streamUrl: 'http://103.151.60.162:2122/play/a028/index.m3u8?hls',
    country: 'India',
    quality: '720p'
  },
  {
    id: 'cricket-star-sports-select1',
    name: 'Star Sports Select 1 HD',
    logo: 'https://i.imgur.com/Mh9tKPx.png',
    category: 'Sports',
    streamUrl: 'http://103.151.60.162:2122/play/a026/index.m3u8?hls',
    country: 'India',
    quality: '1080p'
  },
  {
    id: 'cricket-star-sports-select2',
    name: 'Star Sports Select 2 HD',
    logo: 'https://i.imgur.com/FtRT73R.png',
    category: 'Sports',
    streamUrl: 'http://103.151.60.162:2122/play/a027/index.m3u8?hls',
    country: 'India',
    quality: '1080p'
  },
  {
    id: 'cricket-star-sports-2',
    name: 'Star Sports 2',
    logo: 'https://xstreamcp-assets-msp.streamready.in/assets/LIVETV/LIVECHANNEL/LIVETV_LIVETVCHANNEL_STAR_SPORTS_2/images/LOGO_HD/image.png',
    category: 'Sports',
    streamUrl: 'http://103.151.60.162:2122/play/a00v/index.m3u8?hls',
    country: 'India',
    quality: '720p'
  },
  {
    id: 'cricket-ten-cricket',
    name: 'Ten Cricket Live',
    logo: 'https://i.imgur.com/K5XIFuW.png',
    category: 'Sports',
    streamUrl: 'http://103.151.60.162:2122/play/a0fj/index.m3u8?hls',
    country: 'India / Asia',
    quality: '720p'
  },
  {
    id: 'cricket-ptv-sports',
    name: 'PTV Sports Live (Cricket)',
    logo: 'https://i.imgur.com/CPm6GHA.png',
    category: 'Sports',
    streamUrl: 'http://103.250.28.74:8000/play/a019/index.m3u8',
    country: 'Pakistan',
    quality: '1080p'
  },
  {
    id: 'sports-1',
    name: 'Red Bull TV (Live Sports)',
    logo: 'https://upload.wikimedia.org/wikipedia/en/thumb/f/f5/Red_Bull_TV_logo.svg/320px-Red_Bull_TV_logo.svg.png',
    category: 'Sports',
    streamUrl: 'https://rbmn-live.akamaized.net/hls/live/590964/BoRB-AT/master.m3u8',
    country: 'Global',
    quality: '1080p'
  },
  {
    id: 'sports-2',
    name: 'Stadium Sports HD',
    logo: 'https://images.pluto.tv/channels/5ca29c9ef472141527498c11/colorLogoPNG.png',
    category: 'Sports',
    streamUrl: 'https://dai.google.com/linear/hls/event/sid1/stream.m3u8',
    country: 'USA',
    quality: '720p'
  },
  {
    id: 'sports-3',
    name: 'World Poker Tour (Live)',
    logo: 'https://images.pluto.tv/channels/59b2da0beeb9bb7e39a3f2db/colorLogoPNG.png',
    category: 'Sports',
    streamUrl: 'https://stitcher.pluto.tv/v1/stitch/embed/hls/channel/59b2da0beeb9bb7e39a3f2db/master.m3u8?deviceType=samsung-tvplus&deviceMake=samsung',
    country: 'USA',
    quality: '1080p'
  },
  {
    id: 'sports-4',
    name: 'Motorvision Motorsports',
    logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c5/Motorvision_TV_Logo.svg/320px-Motorvision_TV_Logo.svg.png',
    category: 'Sports',
    streamUrl: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
    country: 'Global',
    quality: '1080p'
  },

  // --- NEWS ---
  {
    id: 'news-1',
    name: 'Sky News Live HD',
    logo: 'https://upload.wikimedia.org/wikipedia/en/thumb/8/82/Sky_News_logo_2020.svg/320px-Sky_News_logo_2020.svg.png',
    category: 'News',
    streamUrl: 'https://linear417-gb-dash1-prd-cf.cdn.sky.com/016a/2301/247/01/manifest.m3u8',
    country: 'UK',
    quality: '1080p'
  },
  {
    id: 'news-2',
    name: 'ABC News Live',
    logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2a/ABC_News_logo_2021.svg/320px-ABC_News_logo_2021.svg.png',
    category: 'News',
    streamUrl: 'https://content.uplynk.com/channel/3324f2467c414329b3b0cc5cd987b6be.m3u8',
    country: 'USA',
    quality: '1080p'
  },
  {
    id: 'news-3',
    name: 'EuroNews English',
    logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/23/Euronews_2016_logo.svg/320px-Euronews_2016_logo.svg.png',
    category: 'News',
    streamUrl: 'https://euronews-euronews-world-1-au.samsung.wurl.tv/playlist.m3u8',
    country: 'Europe',
    quality: '1080p'
  },
  {
    id: 'news-4',
    name: 'Al Jazeera English HD',
    logo: 'https://upload.wikimedia.org/wikipedia/en/thumb/f/f2/Al_Jazeera_English_logo.svg/320px-Al_Jazeera_English_logo.svg.png',
    category: 'News',
    streamUrl: 'https://live-hls-web-aje.getaj.net/AJE/index.m3u8',
    country: 'Qatar',
    quality: '1080p'
  },
  {
    id: 'news-5',
    name: 'DW News (Deutsche Welle)',
    logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/75/Deutsche_Welle_symbol_2012.svg/320px-Deutsche_Welle_symbol_2012.svg.png',
    category: 'News',
    streamUrl: 'https://dwamdstream102.akamaized.net/hls/live/2015525/dwstream102/index.m3u8',
    country: 'Germany',
    quality: '1080p'
  },

  // --- MOVIES ---
  {
    id: 'mov-1',
    name: 'Rakuten Action Movies',
    logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b3/Rakuten_TV_logo.svg/320px-Rakuten_TV_logo.svg.png',
    category: 'Movies',
    streamUrl: 'https://rakuten-actionmovies-1-eu.rakuten.wurl.tv/playlist.m3u8',
    country: 'UK',
    quality: '1080p'
  },
  {
    id: 'mov-2',
    name: 'Cineverse Movie Channel',
    logo: 'https://images.pluto.tv/channels/5db72e50529d8d0009c9fe80/colorLogoPNG.png',
    category: 'Movies',
    streamUrl: 'https://stitcher.pluto.tv/v1/stitch/embed/hls/channel/5db72e50529d8d0009c9fe80/master.m3u8?deviceType=samsung-tvplus',
    country: 'USA',
    quality: '1080p'
  },
  {
    id: 'mov-3',
    name: 'Filmstream Classics',
    logo: 'https://images.pluto.tv/channels/5ea84c0f823fc70007886fa7/colorLogoPNG.png',
    category: 'Movies',
    streamUrl: 'https://stitcher.pluto.tv/v1/stitch/embed/hls/channel/5ea84c0f823fc70007886fa7/master.m3u8?deviceType=samsung-tvplus',
    country: 'USA',
    quality: '720p'
  },

  // --- ENTERTAINMENT ---
  {
    id: 'ent-1',
    name: 'FailArmy 24/7',
    logo: 'https://images.pluto.tv/channels/5888e285a8efb7a54823db2e/colorLogoPNG.png',
    category: 'Entertainment',
    streamUrl: 'https://stitcher.pluto.tv/v1/stitch/embed/hls/channel/5888e285a8efb7a54823db2e/master.m3u8?deviceType=samsung-tvplus',
    country: 'USA',
    quality: '1080p'
  },
  {
    id: 'ent-2',
    name: 'Fashion TV HD',
    logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/63/FashionTV_logo.svg/320px-FashionTV_logo.svg.png',
    category: 'Entertainment',
    streamUrl: 'https://fash1043.cloudycdn.services/slive/_definst_/ftv_midest_adaptive.smil/playlist.m3u8',
    country: 'France',
    quality: '1080p'
  },
  {
    id: 'ent-3',
    name: 'Comedy Dynamics',
    logo: 'https://images.pluto.tv/channels/5b995e86542fc348ea2dc274/colorLogoPNG.png',
    category: 'Entertainment',
    streamUrl: 'https://stitcher.pluto.tv/v1/stitch/embed/hls/channel/5b995e86542fc348ea2dc274/master.m3u8?deviceType=samsung-tvplus',
    country: 'USA',
    quality: '720p'
  },

  // --- MUSIC ---
  {
    id: 'mus-1',
    name: 'Trace Urban Global',
    logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/87/Trace_Urban_logo.png/320px-Trace_Urban_logo.png',
    category: 'Music',
    streamUrl: 'https://rakuten-traceurban-1-eu.rakuten.wurl.tv/playlist.m3u8',
    country: 'France',
    quality: '1080p'
  },
  {
    id: 'mus-2',
    name: 'Deluxe Music HD',
    logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f6/Deluxe_Music_Logo_2013.svg/320px-Deluxe_Music_Logo_2013.svg.png',
    category: 'Music',
    streamUrl: 'https://sdn-global-live-streaming-packager-cache.playback.akamaized.net/live/deluxemusic_de/master.m3u8',
    country: 'Germany',
    quality: '1080p'
  },

  // --- KIDS ---
  {
    id: 'kids-1',
    name: 'Duck TV (Animated Kids)',
    logo: 'https://upload.wikimedia.org/wikipedia/en/thumb/0/07/Duck_tv_logo.svg/320px-Duck_tv_logo.svg.png',
    category: 'Kids',
    streamUrl: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
    country: 'Global',
    quality: '1080p'
  },
  {
    id: 'kids-2',
    name: 'Toon Goggles',
    logo: 'https://images.pluto.tv/channels/5db72e50529d8d0009c9fe83/colorLogoPNG.png',
    category: 'Kids',
    streamUrl: 'https://stitcher.pluto.tv/v1/stitch/embed/hls/channel/5db72e50529d8d0009c9fe83/master.m3u8?deviceType=samsung-tvplus',
    country: 'USA',
    quality: '720p'
  }
];

export const SOUTH_HINDI_DUBBED: MediaItem[] = BOLLYWOOD_MOVIES;
export const TOLLYWOOD_MOVIES: MediaItem[] = BOLLYWOOD_MOVIES;
export const TAMIL_MOVIES: MediaItem[] = BOLLYWOOD_MOVIES;
export const INDIAN_WEB_SERIES: MediaItem[] = WEB_SERIES;

