// Janela do PDF ao lado do Projudi: lê o PDF guardado pela esteira (IndexedDB) e o abre no visualizador do Chrome.
const id = new URLSearchParams(location.search).get("id");
const r = indexedDB.open("projudi_esteira", 1);
r.onerror = () => { document.body.textContent = "Não consegui abrir o banco da esteira."; };
r.onsuccess = () => {
  const g = r.result.transaction("pdf").objectStore("pdf").get(id);
  g.onsuccess = () => {
    if (!g.result) { document.body.textContent = "O PDF deste processo não está mais guardado pela extensão."; return; }
    location.replace(URL.createObjectURL(new Blob([g.result], { type: "application/pdf" })));
  };
  g.onerror = () => { document.body.textContent = "Não consegui ler o PDF guardado."; };
};
