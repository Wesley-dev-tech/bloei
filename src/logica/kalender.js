// Pure functies: wat voor dag het is op de kalender, voor de motivator (logica/motivatie.js): een verjaardag, een feestdag, het seizoen.
// De geboortedatum staat in profiel.verjaardag als { dag, maand, jaar }; ze invullen is vrijblijvend.

const twee = (n) => String(n).padStart(2, '0');
const delen = (sleutel) => String(sleutel ?? '').split('-').map(Number);
const schrikkel = (jaar) => (jaar % 4 === 0 && jaar % 100 !== 0) || jaar % 400 === 0;

// Hoeveel dagen een maand hoogstens heeft (februari 29: wie op 29 februari jarig is, moet dat kunnen kiezen).
export function dagenInMaand(maand) {
  return [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][maand - 1] ?? 31;
}

// Een geldige geboortedatum ({ dag, maand, jaar }) of null: een echte dag (29 februari alleen in een schrikkeljaar), niet in de toekomst
// (vandaag: de datumsleutel van vandaag, om dat na te kijken) en hoogstens 120 jaar geleden.
export function geldigeVerjaardag(v, vandaag = null) {
  const dag = Number(v?.dag);
  const maand = Number(v?.maand);
  const jaar = Number(v?.jaar);
  if (![dag, maand, jaar].every(Number.isInteger) || maand < 1 || maand > 12 || dag < 1 || dag > dagenInMaand(maand)) return null;
  if (maand === 2 && dag === 29 && !schrikkel(jaar)) return null;
  if (vandaag) {
    const [nuJaar] = delen(vandaag);
    if (`${jaar}-${twee(maand)}-${twee(dag)}` > vandaag || jaar < nuJaar - 120) return null;
  }
  return { dag, maand, jaar };
}

// Hoe oud ze op een datum is (op haar verjaardag: de leeftijd die ze die dag wordt), of null zonder geldige geboortedatum.
export function leeftijdOp(verjaardag, datum) {
  const v = geldigeVerjaardag(verjaardag);
  const [jaar, maand, dag] = delen(datum);
  if (!v || !jaar) return null;
  const alGeweest = maand > v.maand || (maand === v.maand && dag >= v.dag) || isJarig(v, datum);
  const leeftijd = jaar - v.jaar - (alGeweest ? 0 : 1);
  return leeftijd >= 0 ? leeftijd : null;
}

// Is deze datum haar verjaardag? Wie op 29 februari jarig is, viert in een gewoon jaar op 28 februari.
export function isJarig(verjaardag, datum) {
  const v = geldigeVerjaardag(verjaardag);
  const [jaar, maand, dag] = delen(datum);
  if (!v || !jaar || jaar <= v.jaar) return false; // (de dag van haar geboorte zelf is geen verjaardag)
  if (v.maand === 2 && v.dag === 29 && !schrikkel(jaar)) return maand === 2 && dag === 28;
  return v.maand === maand && v.dag === dag;
}

// Paaszondag van een jaar (de rekenregel van de gregoriaanse kalender), als datumsleutel.
export function pasen(jaar) {
  const a = jaar % 19;
  const b = Math.floor(jaar / 100);
  const c = jaar % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const maand = Math.floor((h + l - 7 * m + 114) / 31);
  const dag = ((h + l - 7 * m + 114) % 31) + 1;
  return `${jaar}-${twee(maand)}-${twee(dag)}`;
}

// De feestdagen met een eigen zin (de groep in teksten.js, motivatie.<groep>): de tien wettelijke Belgische feestdagen (Nieuwjaar, paasmaandag,
// Dag van de Arbeid, O.L.H.-Hemelvaart, pinkstermaandag, de nationale feestdag, O.L.V.-Hemelvaart, Allerheiligen, Wapenstilstand, Kerstmis)
// en daarnaast Valentijn, paaszondag, Pinksteren, Halloween, Sinterklaas, kerstavond, tweede kerstdag en oudejaarsavond. Elke dag heeft
// haar eigen groep, zodat de zin de dag bij haar naam noemt (paasmaandag is geen Pasen, tweede kerstdag geen Kerstmis).
const VASTE_FEESTDAGEN = { '01-01': 'nieuwjaar', '02-14': 'valentijn', '05-01': 'arbeid', '07-21': 'feestdag', '08-15': 'olv', '10-31': 'halloween', '11-01': 'allerheiligen', '11-11': 'wapenstilstand', '12-06': 'sinterklaas', '12-24': 'kerstavond', '12-25': 'kerst', '12-26': 'tweedeKerstdag', '12-31': 'oudjaar' };
export function feestdagOp(datum) {
  const [jaar, maand, dag] = delen(datum);
  if (!jaar || !maand || !dag) return null;
  const vast = VASTE_FEESTDAGEN[`${twee(maand)}-${twee(dag)}`];
  if (vast) return vast;
  const zondag = pasen(jaar);
  const [, pm, pd] = delen(zondag);
  // De dagen die met Pasen meeschuiven: paasmaandag (+1), O.L.H.-Hemelvaart (+39), Pinksteren (+49) en pinkstermaandag (+50).
  const na = (dagen) => {
    const d = new Date(jaar, pm - 1, pd + dagen);
    return d.getMonth() + 1 === maand && d.getDate() === dag;
  };
  if (na(0)) return 'pasen';
  if (na(1)) return 'paasmaandag';
  if (na(39)) return 'hemelvaart';
  if (na(49)) return 'pinksteren';
  if (na(50)) return 'pinkstermaandag';
  return null;
}

// Het seizoen van een datum: { naam: 'lente' | 'zomer' | 'herfst' | 'winter', start: is dit de dag waarop het begint }.
// Lente vanaf 20 maart, zomer vanaf 21 juni, herfst vanaf 22 september, winter vanaf 21 december.
const SEIZOENEN = [['03-20', 'lente'], ['06-21', 'zomer'], ['09-22', 'herfst'], ['12-21', 'winter']];
export function seizoenOp(datum) {
  const [jaar, maand, dag] = delen(datum);
  if (!jaar || !maand || !dag) return null;
  const md = `${twee(maand)}-${twee(dag)}`;
  let naam = 'winter';
  for (const [begin, seizoen] of SEIZOENEN) if (md >= begin) naam = seizoen;
  return { naam, start: SEIZOENEN.some(([begin]) => begin === md) };
}
