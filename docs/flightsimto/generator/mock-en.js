// Atrapa backendu Tauri z angielskimi przykładowymi danymi do zrzutów prezentacyjnych.
(() => {
  const qs = new URLSearchParams(location.search);
  const theme = qs.get('theme') || 'dark';
  const GB = 1024 ** 3; const MB = 1024 ** 2;
  const DAY = 86400000; const NOW = Date.parse('2026-11-18T18:30:00Z');
  const pals = ['day', 'golden', 'dusk', 'dawn', 'alpine', 'night', 'tropic', 'arctic'];
  const img = (kind, seed, pal, acc) => `/__img/${kind}/${seed}/${pal}${acc ? '/' + acc.replace('#', '') : ''}`;
  const slug = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ł/g, 'l').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  // [ICAO, nazwa, miasto, kraj, lat, lon, twórca, paleta, rozmiar GB, włączone, ulubione]
  const APTS = [
    ['KSEA', 'Seattle-Tacoma International', 'Seattle', 'US', 47.449, -122.309, 'Cascade Scenery Works', 'dusk', 3.4, 1],
    ['KSFO', 'San Francisco International', 'San Francisco', 'US', 37.619, -122.375, 'Goldengate Simulations', 'golden', 4.1, 0],
    ['KPDX', 'Portland International', 'Portland', 'US', 45.589, -122.597, 'Cascade Scenery Works', 'dawn', 1.6, 1],
    ['KASE', 'Aspen/Pitkin County', 'Aspen', 'US', 39.223, -106.869, 'Ridgeline Design', 'alpine', 0.9, 0],
    ['KJFK', 'John F. Kennedy International', 'New York', 'US', 40.640, -73.779, 'Skyhaven Scenery', 'night', 5.8, 0],
    ['KBOS', 'Boston Logan International', 'Boston', 'US', 42.364, -71.005, 'Skyhaven Scenery', 'day', 2.7, 0],
    ['KEYW', 'Key West International', 'Key West', 'US', 24.556, -81.760, 'Tropicana Sim', 'tropic', 0.6, 0],
    ['PAJN', 'Juneau International', 'Juneau', 'US', 58.355, -134.576, 'Polar Route Studio', 'arctic', 1.2, 0],
    ['CYVR', 'Vancouver International', 'Vancouver', 'CA', 49.195, -123.184, 'Cascade Scenery Works', 'day', 3.9, 1],
    ['EGLL', 'London Heathrow', 'London', 'GB', 51.470, -0.454, 'Bluecrest Design', 'dawn', 6.3, 1],
    ['EGKK', 'London Gatwick', 'London', 'GB', 51.148, -0.190, 'Bluecrest Design', 'day', 3.1, 0],
    ['EGLC', 'London City', 'London', 'GB', 51.505, 0.055, 'Vistaline', 'dusk', 1.4, 0],
    ['LFPG', 'Paris Charles de Gaulle', 'Paris', 'FR', 49.010, 2.548, 'Meridian Scenery', 'golden', 5.2, 0],
    ['LFLJ', 'Courchevel Altiport', 'Courchevel', 'FR', 45.397, 6.635, 'Ridgeline Design', 'alpine', 0.7, 1],
    ['EDDF', 'Frankfurt am Main', 'Frankfurt', 'DE', 50.033, 8.570, 'Meridian Scenery', 'day', 4.8, 0],
    ['EDDM', 'Munich', 'Munich', 'DE', 48.354, 11.786, 'Meridian Scenery', 'dawn', 3.6, 1],
    ['LOWI', 'Innsbruck Kranebitten', 'Innsbruck', 'AT', 47.260, 11.344, 'Ridgeline Design', 'alpine', 1.9, 1],
    ['LOWS', 'Salzburg W. A. Mozart', 'Salzburg', 'AT', 47.793, 13.004, 'Ridgeline Design', 'golden', 1.3, 1],
    ['LSZH', 'Zurich', 'Zurich', 'CH', 47.458, 8.548, 'Edelweiss Simworks', 'day', 3.3, 1],
    ['LSGS', 'Sion', 'Sion', 'CH', 46.219, 7.327, 'Edelweiss Simworks', 'alpine', 0.8, 1],
    ['LIRF', 'Rome Fiumicino', 'Rome', 'IT', 41.800, 12.239, 'Meridian Scenery', 'golden', 3.8, 0],
    ['LEMD', 'Madrid Barajas', 'Madrid', 'ES', 40.472, -3.561, 'Sol y Sombra Sim', 'day', 4.4, 0],
    ['LPMA', 'Madeira Cristiano Ronaldo', 'Funchal', 'PT', 32.698, -16.774, 'Atlantic Edge', 'tropic', 1.1, 0],
    ['LXGB', 'Gibraltar', 'Gibraltar', 'GI', 36.151, -5.349, 'Atlantic Edge', 'dawn', 0.5, 0],
    ['EPWA', 'Warsaw Chopin', 'Warsaw', 'PL', 52.166, 20.967, 'Vistula Scenery', 'dusk', 2.6, 1],
    ['EPKK', 'Kraków John Paul II', 'Kraków', 'PL', 50.078, 19.785, 'Vistula Scenery', 'day', 1.7, 1],
    ['EPGD', 'Gdańsk Lech Wałęsa', 'Gdańsk', 'PL', 54.378, 18.466, 'Vistula Scenery', 'dawn', 1.2, 0],
    ['ENGM', 'Oslo Gardermoen', 'Oslo', 'NO', 60.194, 11.100, 'Aurora Simulations', 'arctic', 2.9, 0],
    ['BIKF', 'Keflavík International', 'Reykjavík', 'IS', 63.985, -22.606, 'Aurora Simulations', 'arctic', 1.5, 0],
    ['LGSK', 'Skiathos Alexandros Papadiamantis', 'Skiathos', 'GR', 39.177, 23.504, 'Aegean Blue', 'tropic', 0.6, 0],
    ['LGSR', 'Santorini', 'Thira', 'GR', 36.399, 25.479, 'Aegean Blue', 'golden', 0.9, 0],
    ['LDDU', 'Dubrovnik', 'Dubrovnik', 'HR', 42.561, 18.268, 'Aegean Blue', 'day', 1.0, 0],
    ['OMDB', 'Dubai International', 'Dubai', 'AE', 25.253, 55.364, 'Desert Falcon Sim', 'golden', 6.9, 0],
    ['VQPR', 'Paro International', 'Paro', 'BT', 27.403, 89.425, 'Himalaya Works', 'alpine', 1.1, 0],
    ['VHHH', 'Hong Kong International', 'Hong Kong', 'HK', 22.308, 113.918, 'Harbour Lights Sim', 'night', 5.5, 0],
    ['RJTT', 'Tokyo Haneda', 'Tokyo', 'JP', 35.553, 139.781, 'Harbour Lights Sim', 'dusk', 6.1, 0],
    ['NZQN', 'Queenstown', 'Queenstown', 'NZ', -45.021, 168.739, 'Southern Cross Sim', 'alpine', 1.4, 0],
    ['YSSY', 'Sydney Kingsford Smith', 'Sydney', 'AU', -33.946, 151.177, 'Southern Cross Sim', 'day', 4.2, 0],
    ['TNCM', 'Princess Juliana International', 'Philipsburg', 'SX', 18.041, -63.109, 'Tropicana Sim', 'tropic', 1.3, 0],
    ['SBRJ', 'Santos Dumont', 'Rio de Janeiro', 'BR', -22.910, -43.163, 'Tropicana Sim', 'golden', 1.8, 0],
  ];
  const TOP = ['EGLL', 'A320neo Family', 'LOWI', 'Swiss Alps', 'KSEA', 'A320neo Aurora', 'DHC-2 Beaver', 'Live Traffic', 'KJFK', 'PC-12', 'Manhattan', 'LSZH', '787-9 Dreamliner', 'Mediterranean Airports', 'CYVR', 'Volumetric', 'Tokyo City', 'PAJN', 'ATR 72', 'Norway Coastal', 'Central Europe', 'LFLJ', 'A320neo Mistral', 'EPWA'];
  const packages = [];
  let n = 0;
  const add = (o) => {
    const i = n++;
    const folder = o.folder || slug(`${o.creator}-${o.title}`);
    const COMM = ['Cockpit Lighting FX', 'Weather Toolbar Panel', 'KEYW', 'EGLC', 'Checklist Notes'];
    const lib = o.lib ?? (COMM.some((c) => o.title.startsWith(c)) ? 'community' : o.cat === 'scenery' || (o.cat === 'airport' && i % 3 === 0) ? 'lib2' : 'lib1');
    const libName = { lib1: 'Add-on Library', lib2: 'Scenery Vault' }[lib];
    const path = lib === 'community' ? `F:\\MSFS\\Community\\${folder}` : `${lib === 'lib1' ? 'H:\\Add-ons' : 'D:\\Scenery Vault'}\\${o.group ? o.group + '\\' : ''}${folder}`;
    packages.push({
      id: 'p' + i, key: folder, folder, path, source: lib === 'community' ? 'community' : 'library', libraryId: lib === 'community' ? '' : lib, libraryName: libName || '',
      group: o.group || '', enabled: !!o.on, link: o.on && lib !== 'community' ? `F:\\MSFS\\Community\\${folder}` : '',
      hasManifest: true, hasLayout: o.noLayout ? false : true, title: o.title, creator: o.creator, manufacturer: o.manufacturer || '',
      version: o.version || `${1 + (i % 3)}.${(i * 7) % 10}.${i % 4}`, contentType: o.cat === 'aircraft' || o.cat === 'livery' ? 'AIRCRAFT' : 'SCENERY', minGameVersion: '1.37.19', category: o.cat,
      size: Math.round(o.size), files: o.files || Math.round(o.size / (2.7 * MB)) + 40, thumbs: o.thumbs, aircraft: o.variants || [],
      airports: o.airports || [], dependencies: (o.deps || []).map((d) => ({ name: d, version: '1.0.0' })), hasModel: o.cat === 'aircraft', hasPanels: o.cat === 'aircraft', hasFlightModel: o.cat === 'aircraft',
      simObjects: o.simObjects || [], baseAircraft: o.baseAircraft || [], modified: NOW - (TOP.findIndex((t) => o.title.startsWith(t)) >= 0 ? TOP.findIndex((t) => o.title.startsWith(t)) * 0.6 + 0.2 : 12 + i * 0.9) * DAY, error: '',
      meta: { favorite: !!o.fav, locked: !!o.locked, category: '', tags: o.tags || [], note: o.note || '' },
    });
  };

  // Samoloty
  const AC = [
    ['A320neo Family', 'Contrail Labs', 'contrail-a320neo', 7.8, 1, '#2f6fd1', 'day', ['A319neo CFM LEAP-1A', 'A320neo CFM LEAP-1A', 'A320neo PW1100G', 'A321neo CFM LEAP-1A', 'A321neo LR', 'A321XLR'], 1],
    ['737-800 Professional', 'Meridian Simulations', 'meridian-738', 10.9, 0, '#d1462f', 'golden', ['737-700', '737-800 Winglets', '737-800 Split Scimitar', '737-900ER', '737-800 BCF'], 0],
    ['787-9 Dreamliner', 'Aerofoil Studio', 'aerofoil-789', 9.4, 0, '#1b9e8f', 'dusk', ['787-8 GEnx', '787-9 GEnx', '787-9 Trent 1000', '787-10'], 0],
    ['A350-900 XWB', 'Contrail Labs', 'contrail-a359', 8.6, 0, '#7a4fd1', 'dawn', ['A350-900', 'A350-900 ULR', 'A350-1000'], 0],
    ['CRJ-700 Regional Jet', 'Northwind Simworks', 'northwind-crj7', 3.2, 0, '#e08a1e', 'alpine', ['CRJ-550', 'CRJ-700', 'CRJ-900', 'CRJ-1000'], 0],
    ['ATR 72-600 Turboprop', 'Bluecrest Design', 'bluecrest-at76', 2.9, 1, '#2aa1c9', 'arctic', ['ATR 42-600', 'ATR 72-600', 'ATR 72-600F'], 0],
    ['King Air 350i', 'Ridgeback Aviation', 'ridgeback-b350', 1.8, 0, '#3c4a63', 'day', ['King Air 350i', 'King Air 350ER'], 0],
    ['PC-12 NGX', 'Ridgeback Aviation', 'ridgeback-pc12', 1.4, 1, '#c23b5a', 'golden', ['PC-12 NGX', 'PC-12 NGX Floats'], 0],
    ['DHC-2 Beaver Floats', 'Polar Route Studio', 'polar-dhc2', 0.9, 1, '#e3b21b', 'arctic', ['DHC-2 Wheels', 'DHC-2 Floats', 'DHC-2 Amphibian', 'DHC-2 Skis', 'DHC-2 Tundra'], 0],
    ['H135 Helicopter', 'Vistaline', 'vistaline-h135', 1.6, 0, '#d1462f', 'dawn', ['H135 EMS', 'H135 Police', 'H135 Corporate'], 0],
  ];
  AC.forEach(([title, creator, so, gb, on, acc, pal, variants, fav], k) => add({
    title, creator, cat: 'aircraft', size: gb * GB, on, fav, simObjects: [so], variants, locked: k === 0, version: ['1.4.2', '4.0.18', '2.1.0', '1.2.7', '2.6.1', '1.1.3', '3.0.2', '1.0.9', '2.3.0', '1.5.4'][k],
    thumbs: [img('aircraft', 11 + k, pal, acc), img('aircraft', 31 + k, pals[(k + 3) % 8], acc), img('livery', 51 + k, pals[(k + 5) % 8], acc)], age: 3 + k * 6, group: 'Aircraft',
    tags: k === 0 ? ['airliner', 'study-level'] : k === 8 ? ['bush', 'VFR'] : [],
  }));
  // Malowania (fikcyjne linie)
  const LV = [
    ['Aurora Nordic Airways', 'contrail-a320neo', '#1b6fd1', 1], ['Mistral Air', 'contrail-a320neo', '#d1462f', 1], ['Pacific Crest', 'contrail-a320neo', '#1b9e8f', 0], ['Vistula Air', 'contrail-a320neo', '#c23b5a', 1],
    ['Atlas Charter', 'meridian-738', '#e08a1e', 0], ['Coral Coast Airlines', 'meridian-738', '#2aa1c9', 0], ['Highland Express', 'meridian-738', '#3c4a63', 0],
    ['Sakura Pacific', 'aerofoil-789', '#d14a7e', 0], ['Desert Star', 'aerofoil-789', '#c99a2e', 0],
    ['Fjordline Regional', 'bluecrest-at76', '#2f6fd1', 1], ['Island Hopper', 'bluecrest-at76', '#1aa37a', 0],
    ['Alaska Bush Air', 'polar-dhc2', '#d1462f', 1], ['Yukon Floatplanes', 'polar-dhc2', '#2a7a3c', 1],
    ['Alpine Air Ambulance', 'vistaline-h135', '#d1462f', 0],
  ];
  LV.forEach(([airline, base, acc, on], k) => {
    const ac = AC.find((a) => a[2] === base);
    add({ title: `${ac[0].split(' ')[0]} ${airline}`, creator: ['Livery Lab', 'Paintshop Aviation', 'Skylark Liveries'][k % 3], cat: 'livery', size: (60 + (k * 37) % 240) * MB, on,
      baseAircraft: [base], thumbs: [img('livery', 70 + k, pals[k % 8], acc)], age: 1 + k * 2.3, group: 'Liveries' });
  });
  // Lotniska
  APTS.forEach(([icao, name, city, cc, lat, lon, creator, pal, gb, on], k) => add({
    title: `${icao} ${name}`, creator, cat: 'airport', size: gb * GB, on, fav: ['EGLL', 'LOWI', 'KSEA'].includes(icao), group: 'Airports',
    airports: [{ icao, name, city, country: cc, lat, lon, source: 'bgl' }],
    thumbs: [img('airport', 100 + k, pal), img('airport', 200 + k, pals[(k + 2) % 8]), img('scenery', 300 + k, pal), img('airport', 400 + k, pals[(k + 5) % 8])],
    deps: ['EGLL', 'KJFK', 'LFPG', 'EDDF', 'KSEA'].includes(icao) ? ['skyhaven-global-object-library'] : icao.startsWith('EP') ? ['vistula-shared-assets'] : [],
    noLayout: icao === 'LXGB', age: 2 + k * 3.1, version: k % 4 === 0 ? '2.0.1' : undefined,
    tags: icao === 'LOWI' ? ['mountain', 'RNP'] : icao === 'LFLJ' ? ['altiport', 'challenging'] : [],
  }));
  // Paczka z kilkoma lotniskami
  add({ title: 'Norway Coastal Airports Pack', creator: 'Aurora Simulations', cat: 'airport', size: 2.2 * GB, on: 0, group: 'Airports',
    airports: [['ENBO', 'Bodø', 'Bodø', 67.269, 14.365], ['ENEV', 'Harstad/Narvik Evenes', 'Evenes', 68.491, 16.678], ['ENTC', 'Tromsø Langnes', 'Tromsø', 69.683, 18.919], ['ENSB', 'Svalbard Longyear', 'Longyearbyen', 78.246, 15.466], ['ENAL', 'Ålesund Vigra', 'Ålesund', 62.560, 6.120]]
      .map(([icao, name, city, lat, lon]) => ({ icao, name, city, country: 'NO', lat, lon, source: 'bgl' })),
    thumbs: [img('airport', 777, 'arctic'), img('scenery', 778, 'arctic'), img('airport', 779, 'dusk')], age: 9 });
  add({ title: 'Alaska Bush Strips Collection', creator: 'Polar Route Studio', cat: 'airport', size: 0.8 * GB, on: 0, group: 'Airports',
    airports: [['PAKT', 'Ketchikan International', 'Ketchikan', 55.355, -131.711], ['PAGS', 'Gustavus', 'Gustavus', 58.425, -135.707], ['PAHN', 'Haines', 'Haines', 59.243, -135.524], ['PASI', 'Sitka Rocky Gutierrez', 'Sitka', 57.047, -135.362]]
      .map(([icao, name, city, lat, lon]) => ({ icao, name, city, country: 'US', lat, lon, source: 'bgl' })),
    thumbs: [img('airport', 881, 'arctic'), img('scenery', 882, 'alpine')], age: 14, tags: ['bush', 'VFR'] });
  const pack = (title, creator, gb, on, pal, seed, list) => add({ title, creator, cat: 'airport', size: gb * GB, on, group: 'Airports',
    airports: list.map(([icao, name, city, country, lat, lon]) => ({ icao, name, city, country, lat, lon, source: 'bgl' })), thumbs: [img('airport', seed, pal), img('airport', seed + 1, 'day')] });
  pack('Central Europe Airports Pack', 'Meridian Scenery', 3.4, 1, 'dawn', 610, [
    ['LKPR', 'Václav Havel Prague', 'Prague', 'CZ', 50.101, 14.260], ['LHBP', 'Budapest Ferenc Liszt', 'Budapest', 'HU', 47.437, 19.255], ['LOWW', 'Vienna International', 'Vienna', 'AT', 48.110, 16.570],
    ['LJLJ', 'Ljubljana Jože Pučnik', 'Ljubljana', 'SI', 46.224, 14.458], ['EDDB', 'Berlin Brandenburg', 'Berlin', 'DE', 52.362, 13.500], ['EDDH', 'Hamburg', 'Hamburg', 'DE', 53.630, 9.988],
    ['EDDL', 'Düsseldorf', 'Düsseldorf', 'DE', 51.289, 6.767], ['EDDS', 'Stuttgart', 'Stuttgart', 'DE', 48.690, 9.222], ['LZIB', 'Bratislava', 'Bratislava', 'SK', 48.170, 17.213]]);
  pack('Mediterranean Airports Pack', 'Sol y Sombra Sim', 4.6, 1, 'golden', 620, [
    ['LEBL', 'Barcelona El Prat', 'Barcelona', 'ES', 41.297, 2.078], ['LEPA', 'Palma de Mallorca', 'Palma', 'ES', 39.552, 2.739], ['LEMG', 'Málaga', 'Málaga', 'ES', 36.675, -4.499],
    ['LPPT', 'Lisbon Humberto Delgado', 'Lisbon', 'PT', 38.781, -9.136], ['LIMC', 'Milan Malpensa', 'Milan', 'IT', 45.630, 8.723], ['LIPZ', 'Venice Marco Polo', 'Venice', 'IT', 45.505, 12.352],
    ['LFMN', 'Nice Côte d’Azur', 'Nice', 'FR', 43.658, 7.216], ['LFLL', 'Lyon Saint-Exupéry', 'Lyon', 'FR', 45.726, 5.091], ['LSGG', 'Geneva', 'Geneva', 'CH', 46.238, 6.109],
    ['LGAV', 'Athens Eleftherios Venizelos', 'Athens', 'GR', 37.936, 23.944], ['LTFM', 'Istanbul', 'Istanbul', 'TR', 41.262, 28.742], ['LIRN', 'Naples Capodichino', 'Naples', 'IT', 40.886, 14.291]]);
  pack('Nordic & Baltic Airports Pack', 'Aurora Simulations', 2.8, 0, 'arctic', 630, [
    ['EKCH', 'Copenhagen Kastrup', 'Copenhagen', 'DK', 55.618, 12.656], ['ESSA', 'Stockholm Arlanda', 'Stockholm', 'SE', 59.652, 17.919], ['EFHK', 'Helsinki-Vantaa', 'Helsinki', 'FI', 60.317, 24.963],
    ['ENBR', 'Bergen Flesland', 'Bergen', 'NO', 60.294, 5.218], ['ESGG', 'Gothenburg Landvetter', 'Gothenburg', 'SE', 57.663, 12.280], ['EETN', 'Tallinn Lennart Meri', 'Tallinn', 'EE', 59.413, 24.833],
    ['EVRA', 'Riga International', 'Riga', 'LV', 56.924, 23.971], ['EYVI', 'Vilnius International', 'Vilnius', 'LT', 54.634, 25.286]]);
  pack('UK, Ireland & Benelux Pack', 'Bluecrest Design', 3.9, 0, 'dawn', 640, [
    ['EIDW', 'Dublin', 'Dublin', 'IE', 53.421, -6.270], ['EGPH', 'Edinburgh', 'Edinburgh', 'GB', 55.950, -3.373], ['EGCC', 'Manchester', 'Manchester', 'GB', 53.354, -2.275],
    ['EHAM', 'Amsterdam Schiphol', 'Amsterdam', 'NL', 52.309, 4.764], ['EBBR', 'Brussels', 'Brussels', 'BE', 50.901, 4.484], ['ELLX', 'Luxembourg Findel', 'Luxembourg', 'LU', 49.626, 6.211],
    ['EGBB', 'Birmingham', 'Birmingham', 'GB', 52.454, -1.748], ['EGAA', 'Belfast International', 'Belfast', 'GB', 54.658, -6.216]]);
  // Sceneria
  [['Swiss Alps 10 m Mesh', 'Edelweiss Simworks', 18.4, 1, 'alpine', 2], ['Manhattan Landmarks', 'Skyhaven Scenery', 3.9, 0, 'night', 1], ['Norwegian Fjords Photoreal', 'Aurora Simulations', 24.7, 0, 'arctic', 4],
    ['Tokyo City Enhancement', 'Harbour Lights Sim', 6.8, 0, 'dusk', 3], ['Pacific Northwest Vegetation', 'Cascade Scenery Works', 2.1, 1, 'day', 6], ['Poland Landmarks', 'Vistula Scenery', 1.3, 1, 'golden', 5], ['Hawaiian Islands Terrain', 'Tropicana Sim', 9.2, 0, 'tropic', 8]]
    .forEach(([title, creator, gb, on, pal, seed]) => add({ title, creator, cat: 'scenery', size: gb * GB, on, group: 'Scenery', thumbs: [img('scenery', seed, pal), img('scenery', seed + 21, pal)], age: seed * 4 }));
  // Biblioteki obiektów
  add({ title: 'Global Object Library', creator: 'Skyhaven Scenery', folder: 'skyhaven-global-object-library', cat: 'library', size: 1.1 * GB, on: 1, locked: true, thumbs: [img('library', 3, 'day', '#ffc35a')], age: 40 });
  add({ title: 'Vistula Shared Assets', creator: 'Vistula Scenery', folder: 'vistula-shared-assets', cat: 'library', size: 0.4 * GB, on: 0, thumbs: [img('library', 5, 'golden', '#d1462f')], age: 33 });
  add({ title: 'Airport Ground Vehicles', creator: 'Bluecrest Design', cat: 'library', size: 0.6 * GB, on: 1, locked: true, thumbs: [img('library', 7, 'dawn', '#2aa1c9')], age: 21 });
  // Narzędzia
  [['Live Traffic Injector', 'Contrail Labs', 0.35, 1, '#5cc4ff'], ['Cockpit Lighting FX', 'Vistaline', 0.05, 1, '#ffc35a'], ['Ground Handling Pro', 'Northwind Simworks', 0.21, 0, '#4fd18b'],
    ['Weather Toolbar Panel', 'Skylark Tools', 0.01, 0, '#b7a2ff'], ['Volumetric Cloud Textures', 'Skylark Tools', 0.9, 1, '#ff95b5']]
    .forEach(([title, creator, gb, on, acc], k) => add({ title, creator, cat: 'utility', size: gb * GB, on, locked: k === 0, thumbs: [img('utility', k + 1, 'night', acc)], age: 6 + k * 5, lib: k === 1 ? 'community' : undefined }));
  add({ title: 'Checklist Notes Panel', creator: 'Community', cat: 'other', size: 4 * MB, on: 0, thumbs: [], age: 60 });

  const P = (title) => packages.find((p) => p.title.startsWith(title));
  const keysOf = (...titles) => titles.map((x) => P(x)?.key).filter(Boolean);
  const onKeys = packages.filter((p) => p.enabled).map((p) => p.key);

  const libs = [
    { id: 'lib1', name: 'Add-on Library', path: 'H:\\Add-ons', exists: true },
    { id: 'lib2', name: 'Scenery Vault', path: 'D:\\Scenery Vault', exists: true },
  ].map((l) => { const pk = packages.filter((p) => p.libraryId === l.id); return { ...l, count: pk.length, enabled: pk.filter((p) => p.enabled).length, size: pk.reduce((a, p) => a + p.size, 0) }; });

  const settings = {
    installationId: 'i1', customCommunity: '', targetCommunity: '', libraries: libs.map(({ id, name, path }) => ({ id, name, path })), parking: '', linkMode: 'junction',
    blockWhileRunning: true, confirmBulk: true, autoUpdateCheck: false, theme, accent: qs.get('accent') || 'sky', language: 'en', view: qs.get('view') || 'grid', cardSize: +(qs.get('card') || 236),
    mapStyle: qs.get('map') || 'dark', sort: qs.get('sort') || 'title', meta: {}, external: [], onboarded: true, liveryPrompt: 'ask', simbriefUser: 'skyline_pilot', groupCountry: qs.has('group'),
  };
  const installation = { id: 'i1', label: 'MSFS 2024 · Steam', sim: '2024', store: 'steam', userCfg: '', packagesPath: 'F:\\MSFS', communities: ['F:\\MSFS\\Community'], contentXml: null, officialDirs: [], launchUri: '' };
  const scan = {
    packages, communities: ['F:\\MSFS\\Community'], target: 'F:\\MSFS\\Community', parking: '', libraries: libs,
    broken: [], strays: [], suggestedLibraries: [], tookMs: 840, error: '', installation, simRunning: false,
  };
  const lxgb = P('LXGB'); const egll = P('EGLL'); const kjfk = P('KJFK'); const gol = P('Global Object');
  const issues = [
    { id: 'i1', severity: 'warn', kind: 'copies', title: 'Two copies of KSFO San Francisco International are enabled', detail: 'An older version is still linked from Community. Keep one copy so the sim loads the right scenery.', packages: [P('KSFO').id], paths: ['F:\\MSFS\\Community\\goldengate-ksfo-v1', P('KSFO').path], fix: 'disable-copies', fixLabel: '' },
    { id: 'i2', severity: 'warn', kind: 'dependency', title: 'EPWA Warsaw Chopin needs a disabled dependency', detail: 'vistula-shared-assets is installed but must be enabled together with this airport.', packages: [P('EPWA').id, P('Vistula Shared').id], paths: [], fix: 'enable', fixLabel: '' },
    { id: 'i3', severity: 'warn', kind: 'layout', title: 'Missing layout.json: LXGB Gibraltar', detail: 'Without layout.json the simulator may not load this package. It can be rebuilt from the files on disk.', packages: [lxgb.id], paths: [lxgb.path], fix: 'layout', fixLabel: '' },
    { id: 'i4', severity: 'info', kind: 'archive', title: 'Archive left in Community: alpine-lodges-v2.zip', detail: 'Archives in Community are ignored by the simulator. Install it or move it to the Recycle Bin.', packages: [], paths: ['F:\\MSFS\\Community\\alpine-lodges-v2.zip'], fix: 'install', fixLabel: '' },
  ];
  const profiles = [
    { id: 'pr1', name: 'Europe Airliner Ops', note: 'A320neo + major European hubs', color: '#5cc4ff', packages: keysOf('A320neo Family', 'EGLL', 'LFPG', 'EDDF', 'EDDM', 'LSZH', 'LOWI', 'EPWA', 'EPKK', 'A320neo Aurora', 'A320neo Mistral', 'A320neo Vistula', 'Global Object', 'Airport Ground', 'Live Traffic'), officialDisabled: [], categories: [], created: '', updated: '' },
    { id: 'pr2', name: 'Alps VFR', note: 'Mountain airports, mesh and the PC-12', color: '#4fd18b', packages: keysOf('LOWI', 'LOWS', 'LSGS', 'LFLJ', 'LSZH', 'Swiss Alps', 'PC-12', 'Global Object'), officialDisabled: [], categories: [], created: '', updated: '' },
    { id: 'pr3', name: 'Pacific Northwest', note: 'Seattle, Portland, Vancouver & Alaska', color: '#ffc35a', packages: onKeys, officialDisabled: ['asobo-airport-ksea'], categories: [], created: '', updated: '' },
    { id: 'pr4', name: 'Alaska Bush Flying', note: 'Beaver on floats, bush strips', color: '#ff8a5c', packages: keysOf('DHC-2', 'PAJN', 'Alaska Bush Strips', 'DHC-2 Alaska', 'DHC-2 Yukon', 'Global Object'), officialDisabled: [], categories: [], created: '', updated: '' },
    { id: 'pr5', name: 'Asia Long-haul', note: '', color: '#b7a2ff', packages: keysOf('787-9', 'A350', 'VHHH', 'RJTT', 'OMDB', 'Tokyo City', '787-9 Sakura', '787-9 Desert'), officialDisabled: [], categories: [], created: '', updated: '' },
    { id: 'pr6', name: 'Caribbean Getaway', note: 'Island hopping in the ATR', color: '#ff95b5', packages: keysOf('ATR 72', 'ATR Island', 'TNCM', 'KEYW', 'SBRJ', 'Hawaiian', 'Airport Ground'), officialDisabled: [], categories: [], created: '', updated: '' },
  ];
  const at = (h) => new Date(NOW - h * 3600000).toISOString();
  const hist = (batch, label, h, titles, kind = 'link', undone = false) => titles.map((title) => ({ batch, at: at(h), label, title, op: { kind }, undone }));
  const history = [
    ...hist('b1', 'Flight EGLL → LOWI', 0.4, ['EGLL London Heathrow', 'LOWI Innsbruck Kranebitten', 'LSZH Zurich', 'EDDM Munich', 'A320neo Family', 'Swiss Alps 10 m Mesh']),
    ...hist('b2', 'Profile: Pacific Northwest', 3, ['KPDX Portland International', 'Pacific Northwest Vegetation', 'ATR 72-600 Turboprop', 'ATR Fjordline Regional', 'EGLL London Heathrow', 'LFPG Paris Charles de Gaulle', 'EDDF Frankfurt am Main'], 'link'),
    ...hist('b3', 'Install: Norway Coastal Airports Pack', 26, ['Norway Coastal Airports Pack'], 'move'),
    ...hist('b4', 'Light mode', 50, ['737-800 Professional', '787-9 Dreamliner', 'KJFK John F. Kennedy International', 'Manhattan Landmarks'], 'unlink', true),
    ...hist('b5', 'Move to library', 75, ['Swiss Alps 10 m Mesh', 'Norwegian Fjords Photoreal'], 'move'),
  ];
  const official = {
    path: 'F:\\MSFS\\Content.xml', readonly: false,
    packages: [
      ['asobo-airport-ksea', 'Seattle-Tacoma Intl (Handcrafted)', 'airport', 'KSEA', 'Asobo Studio', false],
      ['asobo-airport-egll', 'London Heathrow (Handcrafted)', 'airport', 'EGLL', 'Asobo Studio', true],
      ['asobo-airport-lowi', 'Innsbruck (Handcrafted)', 'airport', 'LOWI', 'Asobo Studio', false],
      ['asobo-aircraft-a320neo', 'A320neo', 'aircraft', '', 'Asobo Studio', true],
      ['asobo-aircraft-c172', '172 Skyhawk', 'aircraft', '', 'Asobo Studio', true],
      ['asobo-aircraft-b787', '787-10 Dreamliner', 'aircraft', '', 'Asobo Studio', true],
      ['asobo-scenery-world-update-alps', 'World Update: Alps', 'scenery', '', 'Asobo Studio', true],
      ['asobo-scenery-pg-london', 'Photogrammetry London', 'scenery', '', 'Asobo Studio', true],
      ['asobo-livery-a320neo-pack', 'A320neo Livery Pack', 'livery', '', 'Asobo Studio', false],
      ['asobo-core-landmarks', 'Global Landmarks', 'core', '', 'Asobo Studio', true],
    ].map(([name, title, category, icao, creator, enabled], k) => ({ name, title, category, icao, creator, enabled, generation: '2024', onDisk: k % 3 === 0, thumb: img(category === 'core' ? 'scenery' : category, 900 + k, pals[k % 8]) })),
  };
  const sb = {
    airports: [
      { icao: 'KSEA', name: 'Seattle-Tacoma International', city: 'Seattle', country: 'US', lat: 47.449, lon: -122.309, role: 'dep' },
      { icao: 'PAJN', name: 'Juneau International', city: 'Juneau', country: 'US', lat: 58.355, lon: -134.576, role: 'arr' },
      { icao: 'PASI', name: 'Sitka Rocky Gutierrez', city: 'Sitka', country: 'US', lat: 57.047, lon: -135.362, role: 'alt' },
      { icao: 'PAKT', name: 'Ketchikan International', city: 'Ketchikan', country: 'US', lat: 55.355, lon: -131.711, role: 'era' },
      { icao: 'CYVR', name: 'Vancouver International', city: 'Vancouver', country: 'CA', lat: 49.195, lon: -123.184, role: 'toalt' },
    ], callsign: 'ANA412', aircraftIcao: 'AT76', aircraftName: 'ATR 72-600', route: 'SUMMA1 SEA J589 YZP', generated: Math.floor((NOW - 1800000) / 1000),
  };
  const search = (q) => { q = q.toUpperCase(); return APTS.filter((a) => a[0].startsWith(q)).slice(0, 6).map(([icao, name, city, country, lat, lon]) => ({ icao, name, city, country, lat, lon })); };
  const H = {
    app_info: { version: '1.5.0', installKind: 'nsis', dataDir: 'C:\\Users\\Pilot\\AppData\\Roaming\\FS Addon Toolkit', airports: 78412 },
    get_settings: settings, save_settings: (a) => a.settings, installations: [installation], get_profiles: profiles, save_profiles: (a) => a.profiles,
    scan, health: issues,
    sim_status: { running: false, disks: [{ mount: 'F:\\', name: 'Games', total: 2e12, free: 6.4e11 }, { mount: 'H:\\', name: 'Add-ons', total: 4e12, free: 1.9e12 }, { mount: 'D:\\', name: 'Data', total: 2e12, free: 3.1e11 }] },
    history, official_list: official, official_backups: [], package_details: (a) => ({ manifest: JSON.stringify({ dependencies: [], content_type: 'SCENERY', title: packages.find((p) => p.id === a.id)?.title, manufacturer: '', creator: packages.find((p) => p.id === a.id)?.creator, package_version: packages.find((p) => p.id === a.id)?.version, minimum_game_version: '1.37.19' }, null, 2), releaseNotes: '', dependents: a.id === gol.id ? [egll.id, kjfk.id] : [] }),
    simbrief_fetch: sb, thumb: (a) => a.path, airport_search: (a) => search(a.query), check_update: null, set_enabled: { changed: 1, skipped: 0, errors: [], batch: 'b9' },
  };
  window.__TAURI__ = {
    core: { invoke: async (cmd, args) => { const h = H[cmd]; if (h === undefined) { console.warn('mock: no', cmd); return null; } return typeof h === 'function' ? h(args) : structuredClone(h); }, convertFileSrc: (p) => p },
    event: { listen: async () => () => {} }, app: { getVersion: async () => '1.5.0' },
    webview: { getCurrentWebview: () => ({ onDragDropEvent: async () => () => {} }) },
    opener: { openPath: async () => {}, openUrl: async () => {} }, dialog: { open: async () => null, save: async () => null },
  };
})();
