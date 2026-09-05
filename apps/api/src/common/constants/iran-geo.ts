/**
 * Static Iran geography for profile province/city validation (ONB-001).
 *
 * This list is INTENTIONALLY DUPLICATED in the web app
 * (`apps/web/src/lib/iran-geo.ts`, lands with ONB-002): it is hand-authored
 * data, not generated contract code, so it cannot travel through
 * `packages/shared-types` codegen (the card explicitly rules out a seed table
 * and a shared module). Keep the two copies byte-identical when editing —
 * provinces are matched by `slug` (the EN key), Persian labels are display-only.
 *
 * Coverage: all 31 provinces, each with its major cities (~5–10; small
 * provinces list what they have). Slugs are kebab-case EN; city slugs are
 * globally unique so a bare city slug is unambiguous in tests and URLs.
 */

export interface IranCity {
  /** Persian display name (primary label — the product is fa-first). */
  nameFa: string;
  /** Unique kebab-case EN slug — the stored/matched key. */
  slug: string;
}

export interface IranProvince {
  /** Persian display name (primary label — the product is fa-first). */
  nameFa: string;
  /** Unique kebab-case EN slug — the stored/matched key. */
  slug: string;
  cities: readonly IranCity[];
}

export const IRAN_PROVINCES: readonly IranProvince[] = [
  {
    nameFa: 'تهران',
    slug: 'tehran',
    cities: [
      { nameFa: 'تهران', slug: 'tehran' },
      { nameFa: 'اسلامشهر', slug: 'eslamshahr' },
      { nameFa: 'شهریار', slug: 'shahriyar' },
      { nameFa: 'ورامین', slug: 'varamin' },
      { nameFa: 'پاکدشت', slug: 'pakdasht' },
      { nameFa: 'قدس', slug: 'quds' },
      { nameFa: 'ملارد', slug: 'malard' },
      { nameFa: 'فیروزکوه', slug: 'firuzkuh' },
      { nameFa: 'دماوند', slug: 'damavand' },
    ],
  },
  {
    nameFa: 'البرز',
    slug: 'alborz',
    cities: [
      { nameFa: 'کرج', slug: 'karaj' },
      { nameFa: 'هشتگرد', slug: 'hashtgerd' },
      { nameFa: 'نظرآباد', slug: 'nazarabad' },
      { nameFa: 'فردیس', slug: 'fardis' },
      { nameFa: 'اشتهارد', slug: 'eshtehard' },
      { nameFa: 'طالقان', slug: 'taleqan' },
    ],
  },
  {
    nameFa: 'اصفهان',
    slug: 'isfahan',
    cities: [
      { nameFa: 'اصفهان', slug: 'isfahan' },
      { nameFa: 'کاشان', slug: 'kashan' },
      { nameFa: 'نجف‌آباد', slug: 'najafabad' },
      { nameFa: 'خمینی‌شهر', slug: 'khomeinishahr' },
      { nameFa: 'شاهین‌شهر', slug: 'shahinshahr' },
      { nameFa: 'فولادشهر', slug: 'fuladshahr' },
      { nameFa: 'زرین‌شهر', slug: 'zarrinshahr' },
      { nameFa: 'مبارکه', slug: 'mobarakeh' },
    ],
  },
  {
    nameFa: 'فارس',
    slug: 'fars',
    cities: [
      { nameFa: 'شیراز', slug: 'shiraz' },
      { nameFa: 'مرودشت', slug: 'marvdasht' },
      { nameFa: 'کازرون', slug: 'kazerun' },
      { nameFa: 'جهرم', slug: 'jahrom' },
      { nameFa: 'فسا', slug: 'fasa' },
      { nameFa: 'داراب', slug: 'darab' },
      { nameFa: 'آباده', slug: 'abadeh' },
      { nameFa: 'اقلید', slug: 'eghlid' },
      { nameFa: 'لار', slug: 'lar' },
    ],
  },
  {
    nameFa: 'خراسان رضوی',
    slug: 'razavi-khorasan',
    cities: [
      { nameFa: 'مشهد', slug: 'mashhad' },
      { nameFa: 'نیشابور', slug: 'neyshabur' },
      { nameFa: 'سبزوار', slug: 'sabzevar' },
      { nameFa: 'تربت حیدریه', slug: 'torbat-e-heydariyeh' },
      { nameFa: 'قوچان', slug: 'quchan' },
      { nameFa: 'کاشمر', slug: 'kashmar' },
      { nameFa: 'تربت جام', slug: 'torbat-e-jam' },
      { nameFa: 'گناباد', slug: 'gonabad' },
      { nameFa: 'سرخس', slug: 'sarakhs' },
    ],
  },
  {
    nameFa: 'آذربایجان شرقی',
    slug: 'east-azerbaijan',
    cities: [
      { nameFa: 'تبریز', slug: 'tabriz' },
      { nameFa: 'مراغه', slug: 'maragheh' },
      { nameFa: 'مرند', slug: 'marand' },
      { nameFa: 'اهر', slug: 'ahar' },
      { nameFa: 'میانه', slug: 'meyaneh' },
      { nameFa: 'بناب', slug: 'bonab' },
      { nameFa: 'شبستر', slug: 'shabestar' },
      { nameFa: 'عجبشیر', slug: 'ajabsheer' },
    ],
  },
  {
    nameFa: 'آذربایجان غربی',
    slug: 'west-azerbaijan',
    cities: [
      { nameFa: 'ارومیه', slug: 'urmia' },
      { nameFa: 'خوی', slug: 'khoy' },
      { nameFa: 'میاندوآب', slug: 'miandoab' },
      { nameFa: 'مهاباد', slug: 'mahabad' },
      { nameFa: 'بوکان', slug: 'bukan' },
      { nameFa: 'سلماس', slug: 'salmas' },
      { nameFa: 'نقده', slug: 'naghadeh' },
      { nameFa: 'پیرانشهر', slug: 'piranshahr' },
      { nameFa: 'تکاب', slug: 'takab' },
    ],
  },
  {
    nameFa: 'اردبیل',
    slug: 'ardabil',
    cities: [
      { nameFa: 'اردبیل', slug: 'ardabil' },
      { nameFa: 'پارس‌آباد', slug: 'parsabad' },
      { nameFa: 'مشگین‌شهر', slug: 'meshginshahr' },
      { nameFa: 'خلخال', slug: 'khalkhal' },
      { nameFa: 'گرمی', slug: 'germi' },
      { nameFa: 'نمین', slug: 'namin' },
      { nameFa: 'نیر', slug: 'nir' },
    ],
  },
  {
    nameFa: 'گلستان',
    slug: 'golestan',
    cities: [
      { nameFa: 'گرگان', slug: 'gorgan' },
      { nameFa: 'گنبد کاووس', slug: 'gonbad-e-kavus' },
      { nameFa: 'علی‌آباد', slug: 'aliabad' },
      { nameFa: 'آق‌قلا', slug: 'aqqala' },
      { nameFa: 'بندر ترکمن', slug: 'bandar-torkaman' },
      { nameFa: 'کلاله', slug: 'kalaleh' },
      { nameFa: 'مینودشت', slug: 'minudasht' },
      { nameFa: 'آزادشهر', slug: 'azadshahr' },
    ],
  },
  {
    nameFa: 'گیلان',
    slug: 'gilan',
    cities: [
      { nameFa: 'رشت', slug: 'rasht' },
      { nameFa: 'بندر انزلی', slug: 'bandar-anzali' },
      { nameFa: 'لاهیجان', slug: 'lahijan' },
      { nameFa: 'آستارا', slug: 'astara' },
      { nameFa: 'لنگرود', slug: 'langrud' },
      { nameFa: 'تالش', slug: 'talesh' },
      { nameFa: 'رودسر', slug: 'rudsar' },
      { nameFa: 'فومن', slug: 'fuman' },
      { nameFa: 'سیاهکل', slug: 'siahkal' },
    ],
  },
  {
    nameFa: 'مازندران',
    slug: 'mazandaran',
    cities: [
      { nameFa: 'ساری', slug: 'sari' },
      { nameFa: 'آمل', slug: 'amol' },
      { nameFa: 'بابل', slug: 'babol' },
      { nameFa: 'قائم‌شهر', slug: 'qaemshahr' },
      { nameFa: 'بابلسر', slug: 'babolsar' },
      { nameFa: 'تنکابن', slug: 'tonekabon' },
      { nameFa: 'نوشهر', slug: 'nowshahr' },
      { nameFa: 'چالوس', slug: 'chalus' },
      { nameFa: 'نور', slug: 'nur' },
      { nameFa: 'محمودآباد', slug: 'mahmudabad' },
    ],
  },
  {
    nameFa: 'خوزستان',
    slug: 'khuzestan',
    cities: [
      { nameFa: 'اهواز', slug: 'ahvaz' },
      { nameFa: 'آبادان', slug: 'abadan' },
      { nameFa: 'خرمشهر', slug: 'khorramshahr' },
      { nameFa: 'دزفول', slug: 'dezful' },
      { nameFa: 'بهبهان', slug: 'behbahan' },
      { nameFa: 'ماهشهر', slug: 'mahshahr' },
      { nameFa: 'شوشتر', slug: 'shushtar' },
      { nameFa: 'اندیمشک', slug: 'andimeshk' },
      { nameFa: 'شوش', slug: 'shush' },
      { nameFa: 'مسجدسلیمان', slug: 'masjed-soleyman' },
    ],
  },
  {
    nameFa: 'هرمزگان',
    slug: 'hormozgan',
    cities: [
      { nameFa: 'بندر عباس', slug: 'bandar-abbas' },
      { nameFa: 'میناب', slug: 'minab' },
      { nameFa: 'قشم', slug: 'qeshm' },
      { nameFa: 'بندر لنگه', slug: 'bandar-lengeh' },
      { nameFa: 'جاسک', slug: 'jask' },
      { nameFa: 'حاجی‌آباد', slug: 'hajiabad' },
      { nameFa: 'رودان', slug: 'rudan' },
      { nameFa: 'بستک', slug: 'bastak' },
    ],
  },
  {
    nameFa: 'بوشهر',
    slug: 'bushehr',
    cities: [
      { nameFa: 'بوشهر', slug: 'bushehr' },
      { nameFa: 'بندر گناوه', slug: 'bandar-ganaveh' },
      { nameFa: 'بندر دیلم', slug: 'bandar-daylam' },
      { nameFa: 'بندر دیر', slug: 'bandar-dayer' },
      { nameFa: 'برازجان', slug: 'borazjan' },
      { nameFa: 'عسلویه', slug: 'asaluyeh' },
    ],
  },
  {
    nameFa: 'کرمان',
    slug: 'kerman',
    cities: [
      { nameFa: 'کرمان', slug: 'kerman' },
      { nameFa: 'رفسنجان', slug: 'rafsanjan' },
      { nameFa: 'سیرجان', slug: 'sirjan' },
      { nameFa: 'جیرفت', slug: 'jiroft' },
      { nameFa: 'بم', slug: 'bam' },
      { nameFa: 'زرند', slug: 'zarand' },
      { nameFa: 'بردسیر', slug: 'bardsir' },
      { nameFa: 'ماهان', slug: 'mahan' },
    ],
  },
  {
    nameFa: 'یزد',
    slug: 'yazd',
    cities: [
      { nameFa: 'یزد', slug: 'yazd' },
      { nameFa: 'میبد', slug: 'meybod' },
      { nameFa: 'اردکان', slug: 'ardakan' },
      { nameFa: 'مهریز', slug: 'mehriz' },
      { nameFa: 'بافق', slug: 'bafq' },
      { nameFa: 'تفت', slug: 'taft' },
      { nameFa: 'ابرکوه', slug: 'abarkuh' },
    ],
  },
  {
    nameFa: 'کرمانشاه',
    slug: 'kermanshah',
    cities: [
      { nameFa: 'کرمانشاه', slug: 'kermanshah' },
      { nameFa: 'اسلام‌آباد غرب', slug: 'eslamabad-e-gharb' },
      { nameFa: 'سنقر', slug: 'sonqor' },
      { nameFa: 'هرسین', slug: 'harsin' },
      { nameFa: 'کنگاور', slug: 'kangavar' },
      { nameFa: 'جوانرود', slug: 'javanrud' },
      { nameFa: 'پاوه', slug: 'paveh' },
      { nameFa: 'قصر شیرین', slug: 'qasr-e-shirin' },
      { nameFa: 'صحنه', slug: 'sahneh' },
    ],
  },
  {
    nameFa: 'کردستان',
    slug: 'kurdistan',
    cities: [
      { nameFa: 'سنندج', slug: 'sanandaj' },
      { nameFa: 'سقز', slug: 'saqqez' },
      { nameFa: 'مریوان', slug: 'marivan' },
      { nameFa: 'بانه', slug: 'baneh' },
      { nameFa: 'قروه', slug: 'qorveh' },
      { nameFa: 'کامیاران', slug: 'kamyaran' },
      { nameFa: 'دیواندره', slug: 'divandarreh' },
      { nameFa: 'بیجار', slug: 'bijar' },
    ],
  },
  {
    nameFa: 'همدان',
    slug: 'hamadan',
    cities: [
      { nameFa: 'همدان', slug: 'hamadan' },
      { nameFa: 'ملایر', slug: 'malayer' },
      { nameFa: 'نهاوند', slug: 'nahavand' },
      { nameFa: 'تویسرکان', slug: 'tuyserkan' },
      { nameFa: 'اسدآباد', slug: 'asadabad' },
      { nameFa: 'بهار', slug: 'bahar' },
      { nameFa: 'کبودرآهنگ', slug: 'kabudarahang' },
    ],
  },
  {
    nameFa: 'لرستان',
    slug: 'lorestan',
    cities: [
      { nameFa: 'خرم‌آباد', slug: 'khorramabad' },
      { nameFa: 'بروجرد', slug: 'borujerd' },
      { nameFa: 'دورود', slug: 'dorud' },
      { nameFa: 'الیگودرز', slug: 'aligudarz' },
      { nameFa: 'ازنا', slug: 'azna' },
      { nameFa: 'کوهدشت', slug: 'kuhdasht' },
      { nameFa: 'نورآباد', slug: 'nurabad' },
    ],
  },
  {
    nameFa: 'مرکزی',
    slug: 'markazi',
    cities: [
      { nameFa: 'اراک', slug: 'arak' },
      { nameFa: 'ساوه', slug: 'saveh' },
      { nameFa: 'خمین', slug: 'khomein' },
      { nameFa: 'محلات', slug: 'mahallat' },
      { nameFa: 'دلیجان', slug: 'delijan' },
      { nameFa: 'تفرش', slug: 'tafresh' },
      { nameFa: 'آشتیان', slug: 'ashtian' },
      { nameFa: 'شازند', slug: 'shazand' },
    ],
  },
  {
    nameFa: 'قزوین',
    slug: 'qazvin',
    cities: [
      { nameFa: 'قزوین', slug: 'qazvin' },
      { nameFa: 'تاکستان', slug: 'takestan' },
      { nameFa: 'بوئین‌زهرا', slug: 'buyin-zahra' },
      { nameFa: 'آبیک', slug: 'abeyk' },
      { nameFa: 'الوند', slug: 'alvand' },
      { nameFa: 'محمدیه', slug: 'mohammadiyeh' },
    ],
  },
  {
    // Single-city province (Qom) — the card's "~5–10" is aspirational, not a floor.
    nameFa: 'قم',
    slug: 'qom',
    cities: [{ nameFa: 'قم', slug: 'qom' }],
  },
  {
    nameFa: 'سمنان',
    slug: 'semnan',
    cities: [
      { nameFa: 'سمنان', slug: 'semnan' },
      { nameFa: 'شاهرود', slug: 'shahrud' },
      { nameFa: 'دامغان', slug: 'damghan' },
      { nameFa: 'گرمسار', slug: 'garmsar' },
      { nameFa: 'مهدی‌شهر', slug: 'mehdishahr' },
    ],
  },
  {
    nameFa: 'زنجان',
    slug: 'zanjan',
    cities: [
      { nameFa: 'زنجان', slug: 'zanjan' },
      { nameFa: 'ابهر', slug: 'abhar' },
      { nameFa: 'خرمدره', slug: 'khorramdareh' },
      { nameFa: 'قیدار', slug: 'qeydar' },
      { nameFa: 'سلطانیه', slug: 'sultaniyeh' },
      { nameFa: 'ماه‌نشان', slug: 'mahneshan' },
    ],
  },
  {
    nameFa: 'سیستان و بلوچستان',
    slug: 'sistan-baluchestan',
    cities: [
      { nameFa: 'زاهدان', slug: 'zahedan' },
      { nameFa: 'زابل', slug: 'zabol' },
      { nameFa: 'چابهار', slug: 'chabahar' },
      { nameFa: 'ایرانشهر', slug: 'iranshahr' },
      { nameFa: 'سراوان', slug: 'saravan' },
      { nameFa: 'خاش', slug: 'khash' },
      { nameFa: 'نیک‌شهر', slug: 'nikshahr' },
      { nameFa: 'کنارک', slug: 'konarak' },
    ],
  },
  {
    nameFa: 'خراسان جنوبی',
    slug: 'south-khorasan',
    cities: [
      { nameFa: 'بیرجند', slug: 'birjand' },
      { nameFa: 'قائن', slug: 'qaen' },
      { nameFa: 'فردوس', slug: 'ferdows' },
      { nameFa: 'نهبندان', slug: 'nehbandan' },
      { nameFa: 'بشرویه', slug: 'bashruiyeh' },
    ],
  },
  {
    nameFa: 'خراسان شمالی',
    slug: 'north-khorasan',
    cities: [
      { nameFa: 'بجنورد', slug: 'bojnurd' },
      { nameFa: 'شیروان', slug: 'shirvan' },
      { nameFa: 'اسفراین', slug: 'esfarayen' },
      { nameFa: 'جاجرم', slug: 'jajarm' },
      { nameFa: 'فاروج', slug: 'faruj' },
      { nameFa: 'گرمه', slug: 'garme' },
    ],
  },
  {
    nameFa: 'چهارمحال و بختیاری',
    slug: 'chaharmahal-bakhtiari',
    cities: [
      { nameFa: 'شهرکرد', slug: 'shahrekord' },
      { nameFa: 'بروجن', slug: 'borujen' },
      { nameFa: 'فارسان', slug: 'farsan' },
      { nameFa: 'لردگان', slug: 'lordegan' },
      { nameFa: 'فرخ‌شهر', slug: 'farrokhsahr' },
    ],
  },
  {
    nameFa: 'کهگیلویه و بویراحمد',
    slug: 'kohgiluyeh-boyer-ahmad',
    cities: [
      { nameFa: 'یاسوج', slug: 'yasuj' },
      { nameFa: 'دوگنبدان', slug: 'dogonbadan' },
      { nameFa: 'گچساران', slug: 'gachsaran' },
      { nameFa: 'دهدشت', slug: 'dehdasht' },
    ],
  },
  {
    nameFa: 'ایلام',
    slug: 'ilam',
    cities: [
      { nameFa: 'ایلام', slug: 'ilam' },
      { nameFa: 'مهران', slug: 'mehran' },
      { nameFa: 'دهلران', slug: 'dehloran' },
      { nameFa: 'دره‌شهر', slug: 'darrehshahr' },
      { nameFa: 'آبدانان', slug: 'abdanan' },
      { nameFa: 'ایوان', slug: 'ivan' },
    ],
  },
];

/** Province lookup by slug. */
export function findIranProvince(slug: string): IranProvince | undefined {
  return IRAN_PROVINCES.find((province) => province.slug === slug);
}

/**
 * City-in-province pair check — the server-side validation rule for
 * PUT /profiles/onboarding (the client always sends province + city together).
 */
export function findIranCity(provinceSlug: string, citySlug: string): IranCity | undefined {
  return findIranProvince(provinceSlug)?.cities.find((city) => city.slug === citySlug);
}
