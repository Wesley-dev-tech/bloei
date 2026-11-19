// Welke caches mag een service worker bij 'activate' opruimen (R6-05)? Alleen de oude caches van haar eigen versie.
// Een cachenaam is voorvoegsel + '-' + revisie (base36, zonder streepje): 'bloei-k3x9' voor de echte app, 'bloei-demo-k3x9' voor de demo.
// 'bloei-demo-k3x9' begint ook met 'bloei-', maar na dat voorvoegsel staat er nog een streepje: dat is dus niet van de echte app.
export function isEigenOudeCache(naam, voorvoegsel, huidig) {
  if (naam === huidig || !naam.startsWith(voorvoegsel + '-')) return false;
  return !naam.slice(voorvoegsel.length + 1).includes('-');
}
