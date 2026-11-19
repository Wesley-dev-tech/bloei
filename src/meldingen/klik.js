// Een tik op een melding: een open venster van de app focussen (op het juiste scherm) of de app openen.
export async function opneApp(clients, bereik, pad) {
  const doel = new URL(bereik);
  doel.hash = pad || '#/vandaag';
  const vensters = await clients.matchAll({ type: 'window', includeUncontrolled: true });
  const eigen = vensters.find((v) => v.url.startsWith(bereik));
  if (!eigen) return clients.openWindow(doel.href);
  try {
    await eigen.focus();
    await eigen.navigate(doel.href);
  } catch {
    // navigate kan niet altijd: dan vraagt de app zelf om het scherm (zie startMeldingen)
    eigen.postMessage({ soort: 'ga', pad: pad || '#/vandaag' });
  }
  return eigen;
}
