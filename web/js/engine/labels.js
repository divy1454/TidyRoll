// Maps the image model's 1000 ImageNet labels to photo categories and search words.
// Shared by the analysis worker and the main thread.

export const CATEGORY_NAMES = {
  people: 'People',
  portraits: 'Portraits & selfies',
  groups: 'Friends & groups',
  pets: 'Pets & animals',
  food: 'Food & drinks',
  nature: 'Nature & mountains',
  water: 'Beaches & water',
  city: 'City & architecture',
  travel: 'On the move',
  style: 'Outfits & style',
  home: 'At home',
  tech: 'Desk & tech',
  docs: 'Documents & notes',
  night: 'Night',
  golden: 'Golden hour',
};

// Label names exactly as in imagenet-labels.txt.
const BY_CATEGORY = {
  food: ['plate', 'guacamole', 'consomme', 'hot pot', 'trifle', 'ice cream', 'ice lolly', 'French loaf', 'bagel', 'pretzel',
    'cheeseburger', 'hotdog', 'mashed potato', 'head cabbage', 'broccoli', 'cauliflower', 'zucchini', 'spaghetti squash',
    'acorn squash', 'butternut squash', 'cucumber', 'artichoke', 'bell pepper', 'cardoon', 'mushroom', 'Granny Smith',
    'strawberry', 'orange', 'lemon', 'fig', 'pineapple', 'banana', 'jackfruit', 'custard apple', 'pomegranate', 'carbonara',
    'chocolate sauce', 'dough', 'meat loaf', 'pizza', 'potpie', 'burrito', 'red wine', 'espresso', 'cup', 'eggnog',
    'coffee mug', 'coffeepot', 'espresso maker', 'teapot', 'wine bottle', 'beer bottle', 'beer glass', 'goblet',
    'cocktail shaker', 'whiskey jug', 'soup bowl', 'mixing bowl', 'frying pan', 'wok', 'Dutch oven', 'Crock Pot', 'caldron',
    'waffle iron', 'rotisserie', 'restaurant', 'bakery', 'confectionery', 'butcher shop', 'menu', 'tray', 'ladle',
    'wooden spoon', 'spatula', 'saltshaker', 'pop bottle', 'water jug', 'pitcher'],
  nature: ['alp', 'cliff', 'valley', 'volcano', 'geyser', 'mountain tent', 'rapeseed', 'daisy', 'yellow ladys slipper',
    'corn', 'acorn', 'hip', 'buckeye', 'coral fungus', 'agaric', 'gyromitra', 'stinkhorn', 'earthstar', 'hen-of-the-woods',
    'bolete', 'ear', 'hay', 'ski', 'snowmobile', 'dogsled', 'sleeping bag', 'megalith', 'stone wall', 'worm fence',
    'thatch', 'barn', 'harvester', 'thresher', 'plow', 'tractor', 'oxcart', 'swing', 'park bench', 'birdhouse', 'apiary'],
  water: ['seashore', 'sandbar', 'lakeside', 'coral reef', 'promontory', 'boathouse', 'breakwater', 'pier', 'dock', 'canoe',
    'paddle', 'speedboat', 'catamaran', 'trimaran', 'liner', 'yawl', 'schooner', 'lifeboat', 'gondola', 'fireboat',
    'container ship', 'submarine', 'paddlewheel', 'wreck', 'bikini', 'maillot', 'swimming trunks', 'snorkel', 'scuba diver',
    'bathing cap', 'beach wagon', 'sunscreen', 'drilling platform', 'dam', 'aircraft carrier', 'pirate'],
  city: ['palace', 'church', 'mosque', 'monastery', 'castle', 'dome', 'stupa', 'triumphal arch', 'obelisk', 'bell cote',
    'library', 'cinema', 'barbershop', 'bookshop', 'toyshop', 'grocery store', 'tobacco shop', 'shoe shop', 'prison',
    'planetarium', 'greenhouse', 'steel arch bridge', 'suspension bridge', 'viaduct', 'fountain', 'totem pole',
    'water tower', 'beacon', 'street sign', 'traffic light', 'parking meter', 'cliff dwelling', 'pedestal', 'brass',
    'picket fence', 'chainlink fence', 'tile roof', 'vault', 'altar', 'mailbox', 'pay-phone', 'manhole cover', 'flagpole',
    'turnstile', 'cash machine', 'vending machine', 'carousel', 'maypole', 'stage', 'scoreboard', 'yurt', 'mobile home',
    'patio', 'crane', 'lumbermill', 'solar dish', 'radio telescope', 'cinema'],
  travel: ['airliner', 'airship', 'warplane', 'wing', 'passenger car', 'electric locomotive', 'steam locomotive', 'bullet train',
    'freight car', 'streetcar', 'trolleybus', 'minibus', 'school bus', 'cab', 'convertible', 'sports car', 'jeep',
    'limousine', 'minivan', 'Model T', 'racer', 'ambulance', 'police van', 'recreational vehicle', 'moped', 'motor scooter',
    'mountain bike', 'bicycle-built-for-two', 'unicycle', 'tricycle', 'go-kart', 'golfcart', 'pickup', 'tow truck',
    'trailer truck', 'garbage truck', 'fire engine', 'moving van', 'car mirror', 'car wheel', 'seat belt', 'gas pump',
    'odometer', 'jinrikisha', 'horse cart', 'parachute', 'balloon', 'space shuttle', 'crash helmet', 'disk brake', 'grille'],
  style: ['jersey', 'sweatshirt', 'cardigan', 'suit', 'kimono', 'abaya', 'miniskirt', 'jean', 'trench coat', 'fur coat',
    'poncho', 'sarong', 'gown', 'overskirt', 'hoopskirt', 'pajama', 'brassiere', 'sunglasses', 'sunglass', 'sombrero',
    'cowboy hat', 'bonnet', 'cloak', 'academic gown', 'bow tie', 'Windsor tie', 'bolo tie', 'stole', 'feather boa', 'wig',
    'running shoe', 'Loafer', 'clog', 'cowboy boot', 'sandal', 'sock', 'purse', 'wallet', 'backpack', 'necklace',
    'lipstick', 'face powder', 'perfume', 'hair spray', 'lotion', 'hair slide', 'military uniform', 'vestment', 'velvet',
    'wool', 'mitten', 'ski mask', 'mortarboard', 'digital watch'],
  home: ['four-poster', 'studio couch', 'wardrobe', 'chiffonier', 'dining table', 'rocking chair', 'folding chair',
    'bookcase', 'china cabinet', 'home theater', 'entertainment center', 'refrigerator', 'microwave', 'washer',
    'dishwasher', 'stove', 'toaster', 'quilt', 'pillow', 'shower curtain', 'bathtub', 'toilet seat', 'tub', 'washbasin',
    'window shade', 'window screen', 'sliding door', 'shoji', 'lampshade', 'table lamp', 'vase', 'pot', 'radiator',
    'space heater', 'electric fan', 'vacuum', 'iron', 'doormat', 'prayer rug', 'crib', 'cradle', 'bassinet', 'medicine chest',
    'wall clock', 'analog clock', 'candle', 'plate rack', 'bath towel', 'toilet tissue', 'soap dispenser', 'paper towel',
    'teddy', 'jigsaw puzzle', 'pool table', 'grand piano', 'upright', 'throne', 'fire screen', 'bannister', 'hamper',
    'sewing machine', 'chest', 'rain barrel', 'lawn mower', 'Christmas stocking', 'jack-o-lantern'],
  tech: ['laptop', 'notebook', 'desktop computer', 'monitor', 'screen', 'computer keyboard', 'space bar',
    'typewriter keyboard', 'mouse', 'cellular telephone', 'iPod', 'remote control', 'joystick', 'hand-held computer',
    'hard disc', 'modem', 'printer', 'photocopier', 'projector', 'loudspeaker', 'microphone', 'television', 'CD player',
    'cassette player', 'tape player', 'radio', 'reflex camera', 'Polaroid camera', 'lens cap', 'tripod', 'desk',
    'oscilloscope', 'switch', 'power drill', 'digital clock', 'dial telephone', 'electric guitar', 'acoustic guitar'],
  docs: ['menu', 'envelope', 'book jacket', 'comic book', 'crossword puzzle', 'web site', 'packet', 'carton', 'binder',
    'rule', 'slide rule', 'scoreboard', 'street sign', 'notebook', 'pencil box', 'ballpoint', 'fountain pen', 'quill',
    'rubber eraser', 'file'],
  people: ['ballplayer', 'groom', 'scuba diver'],
};

// Broad words a person might search for, mapped to labels and categories.
export const SYNONYMS = {
  dog: { range: [151, 268] }, dogs: { range: [151, 268] }, puppy: { range: [151, 268] },
  cat: { labels: ['tabby', 'tiger cat', 'Persian cat', 'Siamese cat', 'Egyptian cat'] },
  cats: { labels: ['tabby', 'tiger cat', 'Persian cat', 'Siamese cat', 'Egyptian cat'] },
  kitten: { labels: ['tabby', 'tiger cat', 'Persian cat', 'Siamese cat', 'Egyptian cat'] },
  bird: { ranges: [[7, 24], [80, 100], [127, 146]] }, birds: { ranges: [[7, 24], [80, 100], [127, 146]] },
  fish: { ranges: [[0, 6], [389, 397]] }, horse: { labels: ['sorrel', 'horse cart'] }, horses: { labels: ['sorrel', 'horse cart'] },
  butterfly: { range: [321, 326] }, insect: { range: [300, 326] }, monkey: { range: [365, 382] },
  animal: { category: 'pets' }, animals: { category: 'pets' }, pet: { category: 'pets' }, pets: { category: 'pets' },
  wildlife: { category: 'pets' }, zoo: { category: 'pets' },
  coffee: { labels: ['espresso', 'cup', 'coffee mug', 'coffeepot', 'espresso maker'] },
  tea: { labels: ['teapot', 'cup', 'coffee mug'] }, wine: { labels: ['red wine', 'wine bottle', 'goblet'] },
  beer: { labels: ['beer bottle', 'beer glass'] }, drinks: { labels: ['red wine', 'wine bottle', 'beer bottle', 'beer glass', 'cocktail shaker', 'goblet', 'eggnog', 'espresso', 'cup'] },
  pizza: { labels: ['pizza'] }, burger: { labels: ['cheeseburger'] }, dessert: { labels: ['ice cream', 'ice lolly', 'trifle', 'chocolate sauce', 'confectionery'] },
  fruit: { labels: ['Granny Smith', 'strawberry', 'orange', 'lemon', 'fig', 'pineapple', 'banana', 'jackfruit', 'custard apple', 'pomegranate'] },
  fruits: { labels: ['Granny Smith', 'strawberry', 'orange', 'lemon', 'fig', 'pineapple', 'banana', 'jackfruit', 'custard apple', 'pomegranate'] },
  vegetables: { labels: ['head cabbage', 'broccoli', 'cauliflower', 'zucchini', 'cucumber', 'artichoke', 'bell pepper', 'mushroom', 'corn'] },
  food: { category: 'food' }, meal: { category: 'food' }, restaurant: { labels: ['restaurant', 'plate', 'menu'] }, cafe: { labels: ['espresso', 'cup', 'coffee mug', 'restaurant'] },
  beach: { labels: ['seashore', 'sandbar', 'promontory', 'bikini', 'swimming trunks', 'maillot', 'beach wagon', 'sunscreen'] },
  sea: { category: 'water' }, ocean: { category: 'water' }, lake: { labels: ['lakeside', 'boathouse', 'dock', 'canoe', 'paddle'] },
  water: { category: 'water' }, boat: { labels: ['canoe', 'paddle', 'speedboat', 'catamaran', 'trimaran', 'liner', 'yawl', 'schooner', 'lifeboat', 'gondola', 'fireboat', 'container ship', 'paddlewheel', 'dock', 'pier', 'boathouse'] },
  boats: { labels: ['canoe', 'paddle', 'speedboat', 'catamaran', 'trimaran', 'liner', 'yawl', 'schooner', 'lifeboat', 'gondola', 'fireboat', 'container ship', 'paddlewheel', 'dock', 'pier', 'boathouse'] },
  swimming: { labels: ['swimming trunks', 'maillot', 'bikini', 'snorkel', 'scuba diver', 'bathing cap'] },
  mountain: { labels: ['alp', 'valley', 'cliff', 'volcano', 'mountain tent', 'ski', 'snowmobile', 'dogsled'] },
  mountains: { labels: ['alp', 'valley', 'cliff', 'volcano', 'mountain tent', 'ski', 'snowmobile', 'dogsled'] },
  hike: { labels: ['alp', 'valley', 'cliff', 'mountain tent', 'backpack', 'sleeping bag'] }, hiking: { labels: ['alp', 'valley', 'cliff', 'mountain tent', 'backpack', 'sleeping bag'] },
  snow: { labels: ['alp', 'ski', 'snowmobile', 'dogsled', 'snowplow', 'bobsled', 'ski mask', 'mitten'] },
  flowers: { labels: ['daisy', 'yellow ladys slipper', 'rapeseed', 'pot', 'vase'] }, flower: { labels: ['daisy', 'yellow ladys slipper', 'rapeseed', 'pot', 'vase'] },
  nature: { category: 'nature' }, outdoors: { category: 'nature' },
  city: { category: 'city' }, street: { labels: ['street sign', 'traffic light', 'parking meter', 'streetcar', 'trolleybus', 'cab', 'manhole cover', 'mailbox'] },
  church: { labels: ['church', 'bell cote', 'monastery', 'altar', 'dome'] }, temple: { labels: ['stupa', 'monastery', 'altar', 'dome', 'mosque', 'palace'] },
  architecture: { category: 'city' }, building: { category: 'city' }, buildings: { category: 'city' }, bridge: { labels: ['steel arch bridge', 'suspension bridge', 'viaduct'] },
  car: { labels: ['convertible', 'sports car', 'jeep', 'limousine', 'minivan', 'Model T', 'racer', 'cab', 'pickup', 'car mirror', 'car wheel', 'grille', 'seat belt'] },
  cars: { labels: ['convertible', 'sports car', 'jeep', 'limousine', 'minivan', 'Model T', 'racer', 'cab', 'pickup', 'car mirror', 'car wheel', 'grille'] },
  bike: { labels: ['mountain bike', 'bicycle-built-for-two', 'unicycle', 'tricycle', 'moped', 'motor scooter', 'crash helmet'] },
  bikes: { labels: ['mountain bike', 'bicycle-built-for-two', 'unicycle', 'tricycle', 'moped', 'motor scooter'] },
  cycling: { labels: ['mountain bike', 'bicycle-built-for-two', 'tricycle', 'crash helmet'] },
  plane: { labels: ['airliner', 'wing', 'warplane', 'airship'] }, flight: { labels: ['airliner', 'wing', 'warplane', 'airship'] }, airport: { labels: ['airliner', 'wing'] },
  train: { labels: ['passenger car', 'electric locomotive', 'steam locomotive', 'bullet train', 'freight car', 'streetcar'] },
  bus: { labels: ['minibus', 'school bus', 'trolleybus'] }, travel: { category: 'travel' }, transport: { category: 'travel' },
  outfit: { category: 'style' }, outfits: { category: 'style' }, fashion: { category: 'style' }, style: { category: 'style' }, clothes: { category: 'style' },
  shoes: { labels: ['running shoe', 'Loafer', 'clog', 'cowboy boot', 'sandal', 'shoe shop'] }, sunglasses: { labels: ['sunglasses', 'sunglass'] },
  home: { category: 'home' }, house: { category: 'home' }, bedroom: { labels: ['four-poster', 'quilt', 'pillow', 'wardrobe', 'crib'] },
  kitchen: { labels: ['refrigerator', 'microwave', 'dishwasher', 'stove', 'toaster', 'frying pan', 'wok', 'Dutch oven', 'mixing bowl'] },
  laptop: { labels: ['laptop', 'notebook', 'computer keyboard', 'mouse', 'monitor', 'desktop computer', 'space bar'] },
  computer: { labels: ['laptop', 'notebook', 'computer keyboard', 'mouse', 'monitor', 'desktop computer', 'screen'] },
  desk: { category: 'tech' }, work: { category: 'tech' }, tech: { category: 'tech' }, gadgets: { category: 'tech' },
  phone: { labels: ['cellular telephone', 'hand-held computer', 'iPod'] }, camera: { labels: ['reflex camera', 'Polaroid camera', 'lens cap', 'tripod'] },
  music: { labels: ['acoustic guitar', 'electric guitar', 'violin', 'cello', 'grand piano', 'upright', 'drum', 'sax', 'trombone', 'flute', 'harmonica', 'banjo', 'microphone', 'stage'] },
  guitar: { labels: ['acoustic guitar', 'electric guitar'] },
  sport: { labels: ['ballplayer', 'soccer ball', 'basketball', 'volleyball', 'tennis ball', 'baseball', 'rugby ball', 'golf ball', 'racket', 'scoreboard', 'dumbbell', 'barbell', 'punching bag', 'horizontal bar', 'parallel bars', 'balance beam'] },
  sports: { labels: ['ballplayer', 'soccer ball', 'basketball', 'volleyball', 'tennis ball', 'baseball', 'rugby ball', 'golf ball', 'racket', 'scoreboard'] },
  football: { labels: ['soccer ball', 'ballplayer', 'football helmet', 'rugby ball', 'scoreboard'] }, cricket: { labels: ['ballplayer', 'scoreboard'] },
  gym: { labels: ['dumbbell', 'barbell', 'punching bag', 'horizontal bar', 'parallel bars'] },
  books: { labels: ['book jacket', 'bookcase', 'bookshop', 'library', 'comic book'] }, book: { labels: ['book jacket', 'bookcase', 'bookshop', 'library', 'comic book'] },
  document: { category: 'docs' }, documents: { category: 'docs' }, receipt: { category: 'docs' }, receipts: { category: 'docs' },
  notes: { category: 'docs' }, paper: { category: 'docs' }, menu: { labels: ['menu'] },
  people: { category: 'people' }, person: { category: 'people' }, friends: { category: 'groups' }, family: { category: 'groups' },
  group: { category: 'groups' }, selfie: { category: 'portraits' }, selfies: { category: 'portraits' }, portrait: { category: 'portraits' },
  portraits: { category: 'portraits' }, me: { category: 'portraits' }, face: { category: 'portraits' }, faces: { category: 'people' },
  night: { category: 'night' }, nights: { category: 'night' }, dark: { category: 'night' },
  sunset: { category: 'golden' }, sunsets: { category: 'golden' }, sunrise: { category: 'golden' }, 'golden hour': { category: 'golden' }, golden: { category: 'golden' },
  christmas: { labels: ['Christmas stocking', 'candle'] }, halloween: { labels: ['jack-o-lantern', 'mask'] },
  baby: { labels: ['crib', 'cradle', 'bassinet', 'diaper', 'bib', 'nipple', 'teddy'] }, kids: { labels: ['teddy', 'crib', 'swing', 'tricycle', 'toyshop'] },
  wedding: { labels: ['groom', 'gown', 'suit', 'bow tie', 'altar', 'church', 'velvet'] }, party: { labels: ['balloon', 'candle', 'red wine', 'goblet', 'cocktail shaker', 'beer glass', 'stage'] },
  shopping: { labels: ['shopping cart', 'shopping basket', 'grocery store', 'shoe shop', 'toyshop', 'bookshop', 'confectionery', 'plastic bag'] },
};

let LABELS = null;
let LABEL_INDEX = null;
let CAT_OF = null; // Int8Array: label index -> category id, -1 if none
export const CAT_KEYS = ['food', 'nature', 'water', 'city', 'travel', 'style', 'home', 'tech', 'docs', 'people', 'pets'];

export function initLabels(text) {
  LABELS = text.split('\n').map((s) => s.trim());
  LABEL_INDEX = new Map();
  LABELS.forEach((l, i) => { if (!LABEL_INDEX.has(l)) LABEL_INDEX.set(l, i); });
  CAT_OF = new Int8Array(LABELS.length).fill(-1);
  for (let i = 0; i <= 397; i++) CAT_OF[i] = CAT_KEYS.indexOf('pets');
  for (const [cat, names] of Object.entries(BY_CATEGORY)) {
    const id = CAT_KEYS.indexOf(cat);
    for (const n of names) {
      const i = LABEL_INDEX.get(n);
      if (i !== undefined && CAT_OF[i] === -1) CAT_OF[i] = id;
    }
  }
  return LABELS;
}

export function labelName(i) { return LABELS ? LABELS[i] : String(i); }

export function labelIndexes(names) {
  return names.map((n) => LABEL_INDEX.get(n)).filter((i) => i !== undefined);
}

/** Sum the probabilities of the top predictions per category. top = [[labelIdx, prob], ...] */
export function categoryScores(top) {
  const s = {};
  for (const [i, p] of top) {
    const c = CAT_OF[i];
    if (c >= 0) s[CAT_KEYS[c]] = (s[CAT_KEYS[c]] || 0) + p;
  }
  return s;
}

/** Labels from a synonym entry, as a Set of label indexes (or null when the entry is a category). */
export function synonymLabels(entry) {
  if (!entry) return null;
  const set = new Set();
  if (entry.range) for (let i = entry.range[0]; i <= entry.range[1]; i++) set.add(i);
  if (entry.ranges) for (const [a, b] of entry.ranges) for (let i = a; i <= b; i++) set.add(i);
  if (entry.labels) for (const i of labelIndexes(entry.labels)) set.add(i);
  return set.size ? set : null;
}
